// @ts-nocheck
import { Config } from './config.js';

export const Api = {
    activeController: null,
    requestLogs: [],

    logRequest(url, payload, headers) {
        const logEntry = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toLocaleTimeString(),
            url,
            payload: JSON.parse(JSON.stringify(payload)), // Deep copy to avoid mutations
            headers: { ...headers },
            status: 'pending',
            response: null,
            error: null,
            duration: 0,
            startTime: performance.now()
        };
        // Obfuscate API keys in headers
        if (logEntry.headers.Authorization) {
            logEntry.headers.Authorization = 'Bearer ****' + logEntry.headers.Authorization.slice(-4);
        }
        // Obfuscate key in URL for Gemini
        logEntry.url = logEntry.url.replace(/key=[^&]+/, 'key=****');

        this.requestLogs.unshift(logEntry);
        if (this.requestLogs.length > 50) this.requestLogs.pop(); // Keep last 50
        return logEntry.id;
    },

    logResponse(id, response, error = null) {
        const entry = this.requestLogs.find(l => l.id === id);
        if (entry) {
            entry.duration = Math.round(performance.now() - entry.startTime);
            entry.status = error ? 'error' : 'success';
            entry.response = response;
            entry.error = error;
        }
    },

    getLogs() {
        return this.requestLogs;
    },

    clearLogs() {
        this.requestLogs = [];
    },

    async _makeRequest(globalPrompt, userPrompt, generationConfig) {
        if (this.activeController) this.activeController.abort();
        this.activeController = new AbortController();

        try {
            const { url, payload, headers } = this._prepareRequest(globalPrompt, userPrompt, generationConfig);
            const makeRequest = async (currentPayload) => {
                const logId = this.logRequest(url, currentPayload, headers);
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(currentPayload),
                    signal: AbortSignal.any([this.activeController.signal, AbortSignal.timeout(30000)])
                });
                if (!res.ok) {
                    const text = await res.text();
                    this.logResponse(logId, text, `HTTP ${res.status}`);
                    return { ok: false, status: res.status, text };
                }
                const json = await res.json();
                this.logResponse(logId, json);
                return { ok: true, json };
            };

            let reqResult = await makeRequest(payload);

            // Retry for LMStudio/OpenAI strictness
            if (!reqResult.ok && reqResult.status === 400 && payload.response_format) {
                const errText = reqResult.text;
                if (errText.includes("must be 'json_schema' or 'text'")) {
                    console.warn("LMStudio strict JSON mode detected, retrying with json_schema...");
                    const schema = this._constructJsonSchema(generationConfig);
                    payload.response_format = { type: "json_schema", json_schema: schema };
                    reqResult = await makeRequest(payload);
                } else if (errText.includes('JSON mode') || errText.includes('not supported') || errText.includes('INVALID_ARGUMENT')) {
                    console.warn("JSON mode failed, retrying without response_format...");
                    delete payload.response_format;
                    reqResult = await makeRequest(payload);
                }
            }

            if (!reqResult.ok) {
                throw new Error(`API request failed: ${reqResult.status} - ${reqResult.text}`);
            }

            const result = reqResult.json;
            return { result, request: { url, headers, payload } };
        } catch (error) {
            if (error.name === 'AbortError') throw new Error("Request timed out or was aborted.");
            console.error("Error calling LLM API:", error);
            throw error;
        } finally {
            this.activeController = null;
        }
    },

    /**
     * Make a streaming request to the LLM API with progress callbacks.
     * Uses SSE (Server-Sent Events) format to receive streamed responses.
     */
    async _makeStreamingRequest(globalPrompt, userPrompt, generationConfig, onProgress) {
        if (this.activeController) this.activeController.abort();
        this.activeController = new AbortController();
        const startTime = Date.now();

        try {
            const { url, payload, headers } = this._prepareRequest(globalPrompt, userPrompt, generationConfig);
            payload.stream = true; // Enable streaming

            const makeStreamingRequest = async (currentPayload) => {
                const logId = this.logRequest(url, currentPayload, headers);
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(currentPayload),
                    signal: AbortSignal.any([this.activeController.signal, AbortSignal.timeout(60000)])
                });
                if (!res.ok) {
                    const text = await res.text();
                    this.logResponse(logId, text, `HTTP ${res.status}`);
                    return { ok: false, status: res.status, text };
                }
                return { ok: true, body: res.body, logId };
            };

            let reqResult = await makeStreamingRequest(payload);

            // Retry for LMStudio/OpenAI strictness (Streaming)
            if (!reqResult.ok && reqResult.status === 400 && payload.response_format) {
                const errText = reqResult.text;
                if (errText.includes("must be 'json_schema' or 'text'")) {
                    console.warn("LMStudio strict JSON mode detected (streaming), retrying with json_schema...");
                    const schema = this._constructJsonSchema(generationConfig);
                    payload.response_format = { type: "json_schema", json_schema: schema };
                    reqResult = await makeStreamingRequest(payload);
                } else if (errText.includes('JSON mode') || errText.includes('not supported') || errText.includes('INVALID_ARGUMENT')) {
                    console.warn("JSON mode failed, retrying without response_format...");
                    delete payload.response_format;
                    reqResult = await makeStreamingRequest(payload);
                }
            }

            if (!reqResult.ok) {
                throw new Error(`API request failed: ${reqResult.status} - ${reqResult.text}`);
            }

            // Parse SSE stream
            const reader = reqResult.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            // Handle both OpenRouter/OpenAI and Gemini formats
                            const content = parsed.choices?.[0]?.delta?.content ||
                                parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            if (content) {
                                accumulatedText += content;
                                if (onProgress) {
                                    onProgress({
                                        text: accumulatedText,
                                        elapsed: Date.now() - startTime
                                    });
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors for malformed chunks
                        }
                    }
                }
            }

            this.logResponse(reqResult.logId, { text: accumulatedText });

            return {
                result: { text: accumulatedText },
                elapsed: Date.now() - startTime,
                request: { url, headers, payload }
            };
        } catch (error) {
            if (error.name === 'AbortError') throw new Error("Request timed out or was aborted.");
            console.error("Error calling LLM API (streaming):", error);
            throw error;
        } finally {
            this.activeController = null;
        }
    },

    async generateWildcards(globalPrompt, categoryPath, existingWords, customInstructions, systemPrompt) {
        const readablePath = categoryPath.replace(/\//g, ' > ').replace(/_/g, ' ');
        const sysPrompt = globalPrompt.replace('{category}', readablePath);
        const userPrompt = `Category Path: '${readablePath}'\nExisting Wildcards: ${existingWords.slice(0, 50).join(', ')}\nCustom Instructions: "${customInstructions.trim()}"`;
        const generationConfig = { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } };

        const { result } = await this._makeRequest(sysPrompt, userPrompt, generationConfig);
        return this._parseResponse(result);
    },

    async suggestItems(parentPath, structure, suggestItemPrompt, parentInstruction = '') {
        const readablePath = parentPath ? parentPath.replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top-Level';
        const globalPrompt = suggestItemPrompt.replace('{parentPath}', readablePath);

        let contextInfo = `For context, here are the existing sibling items at the same level:\n${JSON.stringify(structure, null, 2)}`;
        if (parentInstruction) {
            contextInfo = `Parent Category: "${readablePath}"\nInstructions: "${parentInstruction}"\n\n${contextInfo}`;
        }

        const userPrompt = `${contextInfo}\n\nPlease provide new suggestions for the '${readablePath}' category.`;
        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        name: {
                            type: "STRING",
                            description: "A unique, descriptive name for a new sub-category. MUST use underscores_between_words. MUST NOT be a generic placeholder. MUST NOT contain the parent category's name."
                        },
                        instruction: {
                            type: "STRING",
                            description: "A brief, helpful description of the item's purpose."
                        }
                    },
                    required: ["name", "instruction"]
                }
            }
        };

        const { result, request } = await this._makeRequest(globalPrompt, userPrompt, generationConfig);
        return { suggestions: this._parseResponse(result), request };
    },

    /**
     * Generate prompt templates by combining wildcard category paths.
     * Sends leaf category names for better LLM context, then reconstructs full paths.
     * @param {Object<string, string>} pathMap - Mapping of leaf names to full paths
     * @param {string} instructions - Custom instructions for template style
     * @param {string} templatePrompt - The system prompt for template generation
     * @returns {Promise<string[]>} Array of generated template strings with full paths
     */
    async generateTemplates(pathMap, instructions, templatePrompt) {
        // Build list of leaf names for LLM (semantic context without full path clutter)
        const leafNames = Object.keys(pathMap);
        const leafList = leafNames.map(name => `~~${name}~~`).join(', ');

        const userPrompt = `AVAILABLE WILDCARD CATEGORIES:\n${leafList}\n\nINSTRUCTIONS: ${instructions}`;
        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: { type: "ARRAY", items: { type: "STRING" } }
        };

        const { result } = await this._makeRequest(templatePrompt, userPrompt, generationConfig);
        let templates = this._parseResponse(result);

        // Validation BEFORE expansion (leaf names are used directly)
        const validLeaves = new Set(leafNames);
        const seen = new Set();

        templates = templates.filter(t => {
            t = String(t).trim();
            if (!t || seen.has(t)) return false;
            seen.add(t);

            // Find all ~~LeafName~~ or __LeafName__ placeholders
            const placeholders = t.match(/~~([^~]+)~~|__([^_]+)__/g) || [];

            // Require at least 2 different categories per template
            if (placeholders.length < 2) {
                console.warn(`Template rejected (fewer than 2 placeholders): "${t}"`);
                return false;
            }

            // All leaf names must be in our valid set
            const allValid = placeholders.every(p => {
                // Remove delimiters (~~ or __)
                const leafName = p.replace(/~~|__/g, '');
                const isValid = validLeaves.has(leafName);
                if (!isValid) {
                    console.warn(`Template rejected (invalid placeholder '${leafName}'): "${t}" - Valid leaves:`, Array.from(validLeaves));
                }
                return isValid;
            });
            return allValid;
        });

        // NOW expand valid templates: ~~LeafName~~ -> ~~FullPath~~ (and normalize to ~~)
        return templates.map(t => {
            let expanded = t;
            for (const [leafName, fullPath] of Object.entries(pathMap)) {
                // Replace leaf name with full path, handling both delimiter styles
                // We normalize to ~~ syntax for the final output
                const regex = new RegExp(`(?:~~|__)${leafName}(?:~~|__)`, 'g');
                expanded = expanded.replace(regex, `~~${fullPath}~~`);
            }
            return expanded;
        });
    },

    /**
     * Analyze category paths and assign semantic roles using LLM.
     * Called for categories that heuristics couldn't classify.
     * @param {Array<{nodeId: string, path: string}>} unknownCategories
     * @param {function({processed: number}): void} [onProgress]
     * @returns {Promise<Object<string, {role: string, type: string, confidence: number}>>}
     */
    async analyzeCategories(unknownCategories, onProgress) {
        if (!unknownCategories || unknownCategories.length === 0) return {};

        const results = {};
        const batchSize = 20; // Process in batches to avoid token limits

        // System prompt for category classification
        const systemPrompt = `You are a semantic classifier for image generation prompt categories.
Classify each category path into ONE of these roles:
- Subject: People, characters, creatures, beings (living things)
- Location: Places, environments, scenes, backgrounds
- Style: Art styles, techniques, aesthetics, artists
- Modifier: Colors, moods, lighting, weather, time periods
- Wearable: Clothing, outfits, accessories, armor
- Object: Items, props, vehicles, food
- Action: Poses, expressions, activities

Return a JSON array with your classifications. Be concise.`;

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        nodeId: { type: "STRING", description: "The category node ID" },
                        role: { type: "STRING", description: "One of: Subject, Location, Style, Modifier, Wearable, Object, Action" },
                        type: { type: "STRING", description: "Subtype like Person, Creature, Indoor, Artistic, etc." }
                    },
                    required: ["nodeId", "role"]
                }
            }
        };

        // Process in batches
        for (let i = 0; i < unknownCategories.length; i += batchSize) {
            const batch = unknownCategories.slice(i, i + batchSize);

            // Build user prompt with path context
            const categoryList = batch.map(({ nodeId, path }) =>
                `- ID: ${nodeId} | Path: ${path.replace(/\//g, ' > ').replace(/_/g, ' ')}`
            ).join('\n');

            const userPrompt = `Classify these ${batch.length} category paths:\n\n${categoryList}`;

            try {
                const { result } = await this._makeRequest(systemPrompt, userPrompt, generationConfig);
                const parsed = this._parseResponse(result);

                // Validate and store results
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item.nodeId && item.role) {
                            // Validate role is one of the allowed values
                            const validRoles = ['Subject', 'Location', 'Style', 'Modifier', 'Wearable', 'Object', 'Action'];
                            const normalizedRole = validRoles.find(r => r.toLowerCase() === item.role.toLowerCase());

                            if (normalizedRole) {
                                results[item.nodeId] = {
                                    role: normalizedRole,
                                    type: item.type || 'General',
                                    confidence: 0.75 // LLM confidence
                                };
                            }
                        }
                    }
                }

                if (onProgress) {
                    onProgress({ processed: Math.min(i + batchSize, unknownCategories.length) });
                }
            } catch (error) {
                console.error('Category analysis batch failed:', error);
                // Continue with next batch
            }
        }

        return results;
    },

    /**
     * Use AI to pick the best category for each duplicate wildcard.
     * Processes duplicates in configurable batches with optional parallelism and cooldown.
     * @param {Array} duplicates - Array of {normalized, locations, count} from findDuplicates
     * @param {{batchSize?: number, parallelRequests?: number, cooldownMs?: number}} options
     * @param {function({processed: number, total: number}): void} [onProgress] - Progress callback
     * @returns {Promise<Map<string, string>>} Map of normalized wildcard → path to keep
     */
    async pickBestCategoryForDuplicates(duplicates, options = {}, onProgress = null) {
        const { batchSize = 10, parallelRequests = 1, cooldownMs = 0 } = options;
        const decisions = new Map();

        if (!duplicates || duplicates.length === 0) return decisions;

        // Split into batches
        const batches = [];
        for (let i = 0; i < duplicates.length; i += batchSize) {
            batches.push(duplicates.slice(i, i + batchSize));
        }

        // Use configurable prompt (allows user customization in future)
        const systemPrompt = Config.DEFAULT_DEDUPLICATE_PROMPT;

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        wildcard: { type: "STRING", description: "The normalized duplicate wildcard" },
                        keep_path: { type: "STRING", description: "Full path to the category that should keep this wildcard" }
                    },
                    required: ["wildcard", "keep_path"]
                }
            }
        };

        let processed = 0;

        // Process batches with parallelism
        for (let i = 0; i < batches.length; i += parallelRequests) {
            const parallelBatches = batches.slice(i, i + parallelRequests);

            const batchPromises = parallelBatches.map(async (batch) => {
                // Build user prompt for this batch
                const batchPrompt = batch.map(d => {
                    const pathOptions = d.locations.map(l =>
                        `  - ${l.path.replace(/\//g, ' > ').replace(/_/g, ' ')}`
                    ).join('\n');
                    return `Wildcard: "${d.normalized}"\nFound in:\n${pathOptions}`;
                }).join('\n\n');

                const userPrompt = `Please analyze these ${batch.length} duplicate wildcards and pick the best category for each:\n\n${batchPrompt}`;

                try {
                    const { result } = await this._makeRequest(systemPrompt, userPrompt, generationConfig);
                    const parsed = this._parseResponse(result);

                    // Store decisions
                    if (Array.isArray(parsed)) {
                        parsed.forEach(item => {
                            if (item.wildcard && item.keep_path) {
                                decisions.set(item.wildcard.toLowerCase().trim(), item.keep_path);
                            }
                        });
                    }

                    processed += batch.length;
                    if (onProgress) {
                        onProgress({ processed, total: duplicates.length });
                    }
                } catch (error) {
                    console.error('AI batch processing failed:', error);
                    // On error, don't add decisions for this batch (will fallback in cleanDuplicates)
                    processed += batch.length;
                    if (onProgress) {
                        onProgress({ processed, total: duplicates.length });
                    }
                }
            });

            await Promise.all(batchPromises);

            // Apply cooldown between batch groups (not after last)
            if (cooldownMs > 0 && i + parallelRequests < batches.length) {
                await new Promise(resolve => setTimeout(resolve, cooldownMs));
            }
        }

        return decisions;
    },

    async testConnection(provider, uiCallback, explicitKey = null) {
        if (uiCallback) uiCallback(`Testing connection to ${provider}...`, 'info');

        try {
            let url, requestOptions = { method: 'GET', headers: {} };

            // Helper to get key: use explicit argument first, then DOM
            const getKey = (id) => explicitKey || document.getElementById(id)?.value?.trim() || '';
            const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

            if (provider === 'gemini') {
                const apiKey = getKey('gemini-api-key');
                if (!apiKey) throw new Error("Gemini API key not provided.");
                url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            } else if (provider === 'openrouter') {
                const apiKey = getKey('openrouter-api-key');
                if (!apiKey) throw new Error("OpenRouter API key not provided.");

                // 1. Verify Key first using /auth/key endpoint
                const authUrl = 'https://openrouter.ai/api/v1/auth/key';
                const authResponse = await fetch(authUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });

                if (authResponse.status === 401) {
                    throw new Error("Invalid OpenRouter API Key.");
                } else if (!authResponse.ok) {
                    // Some other error, but let's try reading text
                    const text = await authResponse.text();
                    throw new Error(`OpenRouter Auth Check Failed: ${authResponse.status} - ${text}`);
                }

                // 2. Fetch Models
                url = `https://openrouter.ai/api/v1/models`;
                requestOptions.headers['Authorization'] = `Bearer ${apiKey}`;

            } else if (provider === 'custom') {
                const customUrl = getVal('custom-api-url');
                if (!customUrl) throw new Error("Custom API URL is not provided.");
                url = `${customUrl.replace(/\/$/, '')}/models`;
                const apiKey = getKey('custom-api-key');
                if (apiKey) {
                    requestOptions.headers['Authorization'] = `Bearer ${apiKey}`;
                }
            }

            if (!url) throw new Error("Could not determine URL for testing.");

            const response = await fetch(url, requestOptions);
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Could not retrieve error details.');
                throw new Error(`Request failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
            }
            const data = await response.json();

            let successMessage = '';
            let models = [];

            if (provider === 'gemini') {
                if (!data.models) throw new Error('Invalid response from Gemini API.');
                successMessage = `Gemini connection successful! Found ${data.models.length} models.`;
                models = data.models;
            } else if (provider === 'openrouter') {
                const list = Array.isArray(data) ? data : (data.data || []);
                if (!list.length && !Array.isArray(list)) throw new Error('Invalid response from OpenRouter API.');

                successMessage = `OpenRouter key verified! Found ${list.length} models.`;
                models = list;
            } else if (provider === 'custom') {
                const list = Array.isArray(data) ? data : (data.data || []);
                successMessage = `Custom API connection successful! Found ${list.length} models.`;
                models = list;
            }

            if (uiCallback) uiCallback(successMessage, 'success');
            return models; // Return models so UI can populate lists

        } catch (error) {
            console.error("Connection Test Error:", error);
            let message = `Connection failed: ${error.message}`;
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                message += '\n\nThis is likely a Cross-Origin Resource Sharing (CORS) issue.';
            }
            if (uiCallback) uiCallback(message, 'error'); // Use 'error' type for notification
            throw error;
        }
    },

    _prepareRequest(globalPrompt, userPrompt, generationConfig = {}) {
        const endpoint = document.getElementById('api-endpoint').value; // Still reading DOM for active endpoint
        let apiKey, url, payload, headers = { 'Content-Type': 'application/json' };

        const getKey = (id) => document.getElementById(id)?.value?.trim() || '';
        const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

        // Common Parameters from Config - only use if not default
        const temp = Config.MODEL_TEMPERATURE;
        const maxTokens = Config.MODEL_MAX_TOKENS;
        const topP = Config.MODEL_TOP_P;
        const topK = Config.MODEL_TOP_K ?? 0;

        if (endpoint === 'gemini') {
            apiKey = getKey('gemini-api-key');
            const model = getVal('gemini-model-name') || 'gemini-1.5-flash';
            if (!apiKey) throw new Error("Gemini API key is not provided.");
            url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const geminiGenConfig = {
                ...generationConfig // Allow overrides
            };
            // Only include parameters if they differ from defaults
            if (temp !== undefined && temp !== 0.7) geminiGenConfig.temperature = temp;
            if (maxTokens && maxTokens !== 1000) geminiGenConfig.maxOutputTokens = maxTokens;
            if (topP !== undefined && topP !== 1.0) geminiGenConfig.topP = topP;
            if (topK > 0) geminiGenConfig.topK = topK;

            payload = {
                contents: [
                    { role: "user", parts: [{ text: globalPrompt }] },
                    { role: "model", parts: [{ text: "Understood." }] },
                    { role: "user", parts: [{ text: userPrompt }] }
                ],
                generationConfig: geminiGenConfig
            };
        } else if (endpoint === 'openrouter' || endpoint === 'custom') {
            const isCustom = endpoint === 'custom';
            apiKey = getKey(isCustom ? 'custom-api-key' : 'openrouter-api-key');
            const model = getVal(isCustom ? 'custom-model-name' : 'openrouter-model-name') || (isCustom ? "" : ":free");

            if (!isCustom && !apiKey) throw new Error("OpenRouter API key is not provided.");

            if (isCustom) {
                const customUrl = getVal('custom-api-url');
                if (!customUrl) throw new Error("Custom API URL is not provided.");
                url = `${customUrl.replace(/\/$/, '')}/chat/completions`;
            } else {
                url = `https://openrouter.ai/api/v1/chat/completions`;
            }

            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            payload = {
                model,
                messages: [
                    { role: "user", content: `${globalPrompt}\n\n${userPrompt}` }
                ]
            };

            // Only include parameters if they differ from defaults
            if (temp !== undefined && temp !== 0.7) payload.temperature = temp;
            if (maxTokens && maxTokens !== 1000) payload.max_tokens = maxTokens;
            if (topP !== undefined && topP !== 1.0) payload.top_p = topP;

            // Add extended parameters if not default
            if (topK > 0) payload.top_k = topK;
            if (Config.MODEL_FREQUENCY_PENALTY !== 0) payload.frequency_penalty = Config.MODEL_FREQUENCY_PENALTY;
            if (Config.MODEL_PRESENCE_PENALTY !== 0) payload.presence_penalty = Config.MODEL_PRESENCE_PENALTY;
            if (Config.MODEL_REPETITION_PENALTY !== 1) payload.repetition_penalty = Config.MODEL_REPETITION_PENALTY;
            if (Config.MODEL_MIN_P > 0) payload.min_p = Config.MODEL_MIN_P;
            if (Config.MODEL_TOP_A > 0) payload.top_a = Config.MODEL_TOP_A;
            if (Config.MODEL_SEED > 0) payload.seed = Config.MODEL_SEED;



            // Reasoning Parameters
            const reasoning = {};
            if (Config.MODEL_REASONING_EFFORT && Config.MODEL_REASONING_EFFORT !== 'default') {
                reasoning.effort = Config.MODEL_REASONING_EFFORT;
            }
            if (Config.MODEL_REASONING_MAX_TOKENS > 0) {
                reasoning.max_tokens = Config.MODEL_REASONING_MAX_TOKENS;
            }
            // Only add reasoning object if it has properties
            if (Object.keys(reasoning).length > 0) {
                payload.reasoning = reasoning;
            }

            if (isCustom) {
                const schema = this._constructJsonSchema(generationConfig);
                payload.response_format = { type: "json_schema", json_schema: schema };
            } else {
                payload.response_format = { type: "json_object" };
            }
        } else {
            throw new Error("Invalid API endpoint.");
        }
        return { url, payload, headers };
    },

    _parseResponse(result) {
        const endpoint = document.getElementById('api-endpoint').value;
        try {
            if (endpoint === 'gemini') return JSON.parse(result.candidates[0].content.parts[0].text);
            if (endpoint === 'openrouter' || endpoint === 'custom') {
                let contentStr = result.choices[0].message.content.trim();
                const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(contentStr);
                if (match) contentStr = match[1];
                const content = JSON.parse(contentStr);
                return Array.isArray(content) ? content : content.wildcards || content.categories || content.items || [];
            }
            return [];
        } catch (e) {
            console.error("Failed to parse AI response:", result, e);
            throw new Error(`The AI returned a malformed response. Error: ${e.message}`);
        }
    },

    /**
     * Test the currently selected model with a realistic wildcard generation request.
     * Returns stats including response time, JSON support, and raw response for debugging.
     */
    async testModel(provider, apiKey, modelName, uiCallback) {
        const startTime = performance.now();

        // Load real data from initial-data.yaml to make the test realistic
        let testCategoryPath = 'CREATURES_and_BEINGS/Mythical_Fantasy';
        let testExistingItems = ['dragon', 'griffin', 'unicorn', 'fairy', 'goblin', 'troll'];
        let testInstruction = 'Legendary and fantasy creatures';

        try {
            const yamlResponse = await fetch('data/initial-data.yaml');
            if (yamlResponse.ok) {
                const yamlText = await yamlResponse.text();
                const YAML = await import('https://cdn.jsdelivr.net/npm/yaml@2.3.4/browser/index.js');
                const data = YAML.parse(yamlText);

                // Try to get real data from CREATURES_and_BEINGS > Mythical_Fantasy
                if (data?.CREATURES_and_BEINGS?.Mythical_Fantasy) {
                    testCategoryPath = 'CREATURES_and_BEINGS/Mythical_Fantasy';
                    testExistingItems = data.CREATURES_and_BEINGS.Mythical_Fantasy || [];
                    testInstruction = 'Legendary and fantasy creatures';
                }
            }
        } catch (e) {
            console.warn('Failed to load initial-data.yaml for test, using fallback data', e);
        }

        // Use the actual system prompt from the app's config
        const readablePath = testCategoryPath.replace(/\//g, ' > ').replace(/_/g, ' ');
        const systemPrompt = Config.DEFAULT_SYSTEM_PROMPT.replace('{category}', readablePath);
        const userPrompt = `Category Path: '${readablePath}'\nExisting Wildcards: ${testExistingItems.slice(0, 20).join(', ')}\nCustom Instructions: "${testInstruction}"`;

        try {
            let url, headers, payload;

            // Only include parameters if they differ from defaults
            const temp = Config.MODEL_TEMPERATURE;
            const maxTokens = Config.MODEL_MAX_TOKENS;
            const topP = Config.MODEL_TOP_P;
            const topK = Config.MODEL_TOP_K ?? 0;

            if (provider === 'gemini') {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                headers = { 'Content-Type': 'application/json' };

                const geminiGenConfig = {
                    responseMimeType: 'application/json',
                    responseSchema: { type: 'ARRAY', items: { type: 'STRING' } }
                };
                // Only include if different from defaults
                if (temp !== undefined && temp !== 0.7) geminiGenConfig.temperature = temp;
                if (maxTokens && maxTokens !== 1000) geminiGenConfig.maxOutputTokens = maxTokens;
                if (topP !== undefined && topP !== 1.0) geminiGenConfig.topP = topP;
                if (topK > 0) geminiGenConfig.topK = topK;

                payload = {
                    contents: [
                        { role: "user", parts: [{ text: systemPrompt }] },
                        { role: "model", parts: [{ text: "Understood." }] },
                        { role: "user", parts: [{ text: userPrompt }] }
                    ],
                    generationConfig: geminiGenConfig
                };
            } else if (provider === 'openrouter' || provider === 'custom') {
                const isCustom = provider === 'custom';

                if (isCustom) {
                    const baseUrl = document.getElementById('custom-api-url')?.value || Config?.API_URL_CUSTOM || '';
                    url = baseUrl.replace(/\/$/, '') + '/chat/completions';
                } else {
                    url = 'https://openrouter.ai/api/v1/chat/completions';
                }

                headers = {
                    'Content-Type': 'application/json',
                    ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
                    ...(provider === 'openrouter' && { 'HTTP-Referer': window.location.origin })
                };

                payload = {
                    model: modelName,
                    messages: [
                        { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
                    ],
                    response_format: { type: 'json_object' }
                };

                // Only include if different from defaults
                if (temp !== undefined && temp !== 0.7) payload.temperature = temp;
                if (maxTokens && maxTokens !== 1000) payload.max_tokens = maxTokens;
                if (topP !== undefined && topP !== 1.0) payload.top_p = topP;

                // Add extended parameters if not default
                if (topK > 0) payload.top_k = topK;
                if (Config.MODEL_FREQUENCY_PENALTY !== 0) payload.frequency_penalty = Config.MODEL_FREQUENCY_PENALTY;
                if (Config.MODEL_PRESENCE_PENALTY !== 0) payload.presence_penalty = Config.MODEL_PRESENCE_PENALTY;
                if (Config.MODEL_REPETITION_PENALTY !== 1) payload.repetition_penalty = Config.MODEL_REPETITION_PENALTY;
                if (Config.MODEL_MIN_P > 0) payload.min_p = Config.MODEL_MIN_P;
                if (Config.MODEL_TOP_A > 0) payload.top_a = Config.MODEL_TOP_A;
                if (Config.MODEL_SEED > 0) payload.seed = Config.MODEL_SEED;

                // Reasoning Parameters
                const reasoning = {};
                if (Config.MODEL_REASONING_EFFORT && Config.MODEL_REASONING_EFFORT !== 'default') {
                    reasoning.effort = Config.MODEL_REASONING_EFFORT;
                }
                if (Config.MODEL_REASONING_MAX_TOKENS > 0) {
                    reasoning.max_tokens = Config.MODEL_REASONING_MAX_TOKENS;
                }
                if (Object.keys(reasoning).length > 0) {
                    payload.reasoning = reasoning;
                }
            }

            // Fallback logic for models that don't support json_object
            const makeRequest = async (currentPayload) => {
                const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(currentPayload) });
                if (!res.ok) {
                    const text = await res.text();
                    return { ok: false, status: res.status, text };
                }
                return { ok: true, json: await res.json() };
            };

            let reqResult = await makeRequest(payload);
            const duration = Math.round(performance.now() - startTime);

            // Retry if 400 error regarding JSON mode (OpenAI generic) or LMStudio specific strictness
            if (!reqResult.ok && reqResult.status === 400 &&
                payload.response_format) {

                const errText = reqResult.text;
                // LMStudio specific error: "must be 'json_schema' or 'text'"
                if (errText.includes("must be 'json_schema' or 'text'")) {
                    console.warn("LMStudio strict JSON mode detected, retrying with json_schema...");

                    // Convert standard config to JSON Schema
                    // For testModel, we fundamentally want an array of strings
                    const schema = this._constructJsonSchema({
                        responseSchema: { type: "ARRAY", items: { type: "STRING" } }
                    });

                    payload.response_format = {
                        type: "json_schema",
                        json_schema: schema
                    };
                    reqResult = await makeRequest(payload);

                } else if (errText.includes('JSON mode') || errText.includes('not supported') || errText.includes('INVALID_ARGUMENT')) {
                    // Fallback for others: just remove response_format
                    console.warn("JSON mode failed, retrying without response_format...");
                    delete payload.response_format;
                    reqResult = await makeRequest(payload);
                }
            }

            if (!reqResult.ok) {
                let params = `HTTP ${reqResult.status}`;
                try {
                    const errJson = JSON.parse(reqResult.text);
                    if (errJson.error && errJson.error.message) {
                        params += `: ${errJson.error.message}`;
                        if (errJson.error.metadata && errJson.error.metadata.raw) {
                            params += `\nDetails: ${errJson.error.metadata.raw}`;
                        }
                    } else if (errJson.message) {
                        params += `: ${errJson.message}`;
                    } else {
                        params += `: ${reqResult.text}`;
                    }
                } catch (e) {
                    params += `: ${reqResult.text}`;
                }
                throw new Error(params);
            }

            const result = reqResult.json;

            // Extract the response content
            const message = result.choices?.[0]?.message;
            let rawContent = message?.content || result.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Check for reasoning content (OpenRouter/thinking models)
            if (message?.reasoning) {
                rawContent = `[Reasoning]\n${message.reasoning}\n\n[Content]\n${rawContent}`;
            } else if (message?.reasoning_content) {
                rawContent = `[Reasoning]\n${message.reasoning_content}\n\n[Content]\n${rawContent}`;
            }

            // Check if it's valid JSON array or object
            let parsedContent = null;
            let supportsJson = false;
            try {
                let contentToParse = rawContent;
                // If we combined reasoning and content, we only want to parse the actual content part for JSON
                if (contentToParse.includes('[Content]\n')) {
                    contentToParse = contentToParse.split('[Content]\n')[1] || '';
                }
                contentToParse = contentToParse.trim();

                // Handle markdown code blocks
                const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(contentToParse);
                if (match) {
                    contentToParse = match[1];
                }

                parsedContent = JSON.parse(contentToParse);

                if (Array.isArray(parsedContent)) {
                    supportsJson = parsedContent.length > 0;
                } else if (typeof parsedContent === 'object' && parsedContent !== null) {
                    // Check for common wrapper keys or if it's just a valid object (which implies JSON support)
                    // If we used json_schema with a wrapper key (like "items"), we need to extract it
                    if (parsedContent.items && Array.isArray(parsedContent.items)) {
                        parsedContent = parsedContent.items; // Unwrap for count/display
                        supportsJson = true;
                    } else {
                        supportsJson = true;
                        // Try to find array for count
                        const values = Object.values(parsedContent);
                        const foundArray = values.find(v => Array.isArray(v));
                        if (foundArray) {
                            parsedContent = foundArray; // Use this for count
                        }
                    }
                }
            } catch (e) {
                // Fallback: loose check
                supportsJson = rawContent.includes('[') && rawContent.includes(']');
            }

            const stats = {
                responseTime: duration,
                modelName: modelName,
                supportsJson: supportsJson,
                provider: provider,
                rawResponse: rawContent,
                parsedContent: parsedContent, // Pass the full parsed object
                parsedCount: Array.isArray(parsedContent) ? parsedContent.length : 0,
                usage: result.usage || null,
                request: { url, headers, payload } // Return request details
            };

            if (uiCallback) {
                uiCallback({ success: true, stats });
            }

            return stats;
        } catch (error) {
            const duration = Math.round(performance.now() - startTime);
            if (uiCallback) {
                uiCallback({ success: false, error: error.message, responseTime: duration });
            }
            throw error;
        }
    },

    /**
     * Helper to construct a JSON schema object compatible with OpenAI/LMStudio
     * from our internal generationConfig format.
     */
    _constructJsonSchema(generationConfig) {
        // Default schema if none provided: wrapper object with 'items' array of strings
        const defaultSchema = {
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: { type: "string" }
                }
            },
            required: ["items"]
        };

        if (!generationConfig || !generationConfig.responseSchema) {
            return {
                name: "wildcard_response",
                strict: true,
                schema: defaultSchema
            };
        }

        const internalSchema = generationConfig.responseSchema;
        let finalSchema = {};

        // Convert Google-style schema to OpenAI JSON Schema
        // Case 1: Array of Strings (most common for us)
        if (internalSchema.type === 'ARRAY' && internalSchema.items && internalSchema.items.type === 'STRING') {
            finalSchema = defaultSchema;
        }
        // Case 2: Array of Objects (used for suggestions)
        else if (internalSchema.type === 'ARRAY' && internalSchema.items && internalSchema.items.type === 'OBJECT') {
            // Need to wrap array in an object for JSON Schema root
            const itemProps = {};
            const requiredProps = [];

            if (internalSchema.items.properties) {
                for (const [key, prop] of Object.entries(internalSchema.items.properties)) {
                    itemProps[key] = {
                        type: prop.type.toLowerCase(),
                        description: prop.description
                    };
                }
            }
            if (internalSchema.items.required) {
                requiredProps.push(...internalSchema.items.required);
            }

            finalSchema = {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: itemProps,
                            required: requiredProps,
                            additionalProperties: false
                        }
                    }
                },
                required: ["items"],
                additionalProperties: false
            };
        }
        else {
            // Fallback to default
            finalSchema = defaultSchema;
        }

        return {
            name: "wildcard_response",
            strict: true, // LMStudio requires strict: true (as string "true" or boolean? Docs say "true", OpenAI says boolean true. Let's try boolean.)
            schema: finalSchema
        };
    },

    // ========== BENCHMARK TEST METHODS ==========

    /**
     * Test the Suggestions feature (suggestItems).
     * Uses real data and the configured suggestion prompt.
     */
    async testSuggestions(provider, apiKey, modelName) {
        const startTime = performance.now();

        // Use the configured suggestion prompt
        const basePrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;
        const parentPath = 'CREATURES_and_BEINGS';
        const globalPrompt = basePrompt.replace('{parentPath}', parentPath);

        // Mock sibling structure for context
        const siblingStructure = {
            'Mythical_Fantasy': { instruction: 'Dragons, unicorns, and fantasy creatures' },
            'Animals': { instruction: 'Real-world animals' }
        };

        const userPrompt = `For context, here are the existing sibling items at the same level:\n${JSON.stringify(siblingStructure, null, 2)}\n\nPlease provide new suggestions for the '${parentPath}' category.`;

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING" },
                        instruction: { type: "STRING" }
                    },
                    required: ["name", "instruction"]
                }
            }
        };

        try {
            const { result, request } = await this._makeTestRequest(provider, apiKey, modelName, globalPrompt, userPrompt, generationConfig);
            const duration = Math.round(performance.now() - startTime);

            const parsed = this._parseTestResponse(provider, result);
            const isValidArray = Array.isArray(parsed) && parsed.length > 0;
            const hasCorrectShape = isValidArray && parsed[0]?.name && parsed[0]?.instruction;

            return {
                success: true,
                stats: {
                    responseTime: duration,
                    supportsJson: isValidArray,
                    validSchema: !!hasCorrectShape,
                    parsedCount: isValidArray ? parsed.length : 0,
                    parsedContent: parsed,
                    rawResponse: this._extractRawContent(result, provider),
                    request
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stats: { responseTime: Math.round(performance.now() - startTime) }
            };
        }
    },

    /**
     * Test the Template generation feature.
     * Uses real data and the configured template prompt.
     */
    async testTemplates(provider, apiKey, modelName) {
        const startTime = performance.now();

        const templatePrompt = Config.DEFAULT_TEMPLATE_PROMPT;

        // Mock path map like the real feature uses
        const pathMap = {
            'A': 'CREATURES_and_BEINGS/Mythical_Fantasy',
            'B': 'ACTIONS/Movement',
            'C': 'PLACES/Natural_Environments'
        };

        const pathContext = Object.entries(pathMap)
            .map(([code, path]) => `${code} = "${path.replace(/\//g, ' > ').replace(/_/g, ' ')}"`)
            .join('\n');

        const userPrompt = `PATH MAP:\n${pathContext}\n\nINSTRUCTIONS: Create creative scene compositions`;

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: { type: "ARRAY", items: { type: "STRING" } }
        };

        try {
            const { result, request } = await this._makeTestRequest(provider, apiKey, modelName, templatePrompt, userPrompt, generationConfig);
            const duration = Math.round(performance.now() - startTime);

            const parsed = this._parseTestResponse(provider, result);
            const isValidArray = Array.isArray(parsed) && parsed.length > 0;
            // Check if templates contain __X__ or ~~X~~ format codes
            const hasValidTemplates = isValidArray && parsed.some(t => /__[A-Z]+__|~~[A-Z]+~~/.test(String(t)));

            return {
                success: true,
                stats: {
                    responseTime: duration,
                    supportsJson: isValidArray,
                    validSchema: !!hasValidTemplates,
                    parsedCount: isValidArray ? parsed.length : 0,
                    parsedContent: parsed,
                    rawResponse: this._extractRawContent(result, provider),
                    request
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stats: { responseTime: Math.round(performance.now() - startTime) }
            };
        }
    },

    /**
     * Test the Duplicate Finder AI feature.
     * Uses mock duplicate data and the configured deduplicate prompt.
     */
    async testDupeFinder(provider, apiKey, modelName) {
        const startTime = performance.now();

        const systemPrompt = Config.DEFAULT_DEDUPLICATE_PROMPT;

        // Mock duplicate data
        const mockDuplicates = [
            {
                normalized: 'dragon',
                locations: [
                    { path: 'CREATURES_and_BEINGS/Mythical_Fantasy' },
                    { path: 'CREATURES_and_BEINGS/Animals/Reptiles' }
                ]
            },
            {
                normalized: 'sunset',
                locations: [
                    { path: 'LIGHTING/Natural' },
                    { path: 'PLACES/Natural_Environments' }
                ]
            }
        ];

        const batchPrompt = mockDuplicates.map(d => {
            const pathOptions = d.locations.map(l =>
                `  - ${l.path.replace(/\//g, ' > ').replace(/_/g, ' ')}`
            ).join('\n');
            return `Wildcard: "${d.normalized}"\nFound in:\n${pathOptions}`;
        }).join('\n\n');

        const userPrompt = `Please analyze these ${mockDuplicates.length} duplicate wildcards and pick the best category for each:\n\n${batchPrompt}`;

        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        wildcard: { type: "STRING" },
                        keep_path: { type: "STRING" }
                    },
                    required: ["wildcard", "keep_path"]
                }
            }
        };

        try {
            const { result, request } = await this._makeTestRequest(provider, apiKey, modelName, systemPrompt, userPrompt, generationConfig);
            const duration = Math.round(performance.now() - startTime);

            const parsed = this._parseTestResponse(provider, result);
            const isValidArray = Array.isArray(parsed) && parsed.length > 0;
            const hasCorrectShape = isValidArray && parsed[0]?.wildcard && parsed[0]?.keep_path;

            return {
                success: true,
                stats: {
                    responseTime: duration,
                    supportsJson: isValidArray,
                    validSchema: !!hasCorrectShape,
                    parsedCount: isValidArray ? parsed.length : 0,
                    parsedContent: parsed,
                    rawResponse: this._extractRawContent(result, provider),
                    request
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stats: { responseTime: Math.round(performance.now() - startTime) }
            };
        }
    },

    /**
     * Run a comprehensive benchmark testing all 4 AI features.
     * @param {string} provider - API provider (gemini, openrouter, custom)
     * @param {string} apiKey - API key
     * @param {string} modelName - Model name
     * @param {function} onProgress - Callback for progress updates
     * @returns {Promise<Object>} Aggregated benchmark results
     */
    async runBenchmark(provider, apiKey, modelName, onProgress = () => { }) {
        const results = {
            generate: null,
            suggestions: null,
            templates: null,
            dupeFinder: null,
            totalTime: 0,
            passCount: 0,
            failCount: 0
        };

        const startTotal = performance.now();

        // Test 1: Generate Wildcards (existing testModel)
        onProgress({ phase: 'generate', status: 'running' });
        try {
            results.generate = await new Promise((resolve) => {
                this.testModel(provider, apiKey, modelName, resolve);
            });
            results.generate.success = results.generate.success !== false;
        } catch (e) {
            results.generate = { success: false, error: e.message };
        }
        onProgress({ phase: 'generate', status: 'complete', result: results.generate });

        // Test 2: Suggestions
        onProgress({ phase: 'suggestions', status: 'running' });
        results.suggestions = await this.testSuggestions(provider, apiKey, modelName);
        onProgress({ phase: 'suggestions', status: 'complete', result: results.suggestions });

        // Test 3: Templates
        onProgress({ phase: 'templates', status: 'running' });
        results.templates = await this.testTemplates(provider, apiKey, modelName);
        onProgress({ phase: 'templates', status: 'complete', result: results.templates });

        // Test 4: Dupe Finder
        onProgress({ phase: 'dupeFinder', status: 'running' });
        results.dupeFinder = await this.testDupeFinder(provider, apiKey, modelName);
        onProgress({ phase: 'dupeFinder', status: 'complete', result: results.dupeFinder });

        // Calculate totals
        results.totalTime = Math.round(performance.now() - startTotal);
        results.passCount = [results.generate, results.suggestions, results.templates, results.dupeFinder]
            .filter(r => r?.success).length;
        results.failCount = 4 - results.passCount;

        return results;
    },

    /**
     * Helper to make a test request with proper provider handling.
     * Similar to _prepareRequest but for testing with explicit credentials.
     */
    async _makeTestRequest(provider, apiKey, modelName, systemPrompt, userPrompt, generationConfig) {
        let url, headers, payload;

        const temp = Config.MODEL_TEMPERATURE;
        const maxTokens = Config.MODEL_MAX_TOKENS;
        const topP = Config.MODEL_TOP_P;

        if (provider === 'gemini') {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            headers = { 'Content-Type': 'application/json' };

            const geminiGenConfig = { ...generationConfig };
            if (temp !== undefined && temp !== 0.7) geminiGenConfig.temperature = temp;
            if (maxTokens && maxTokens !== 1000) geminiGenConfig.maxOutputTokens = maxTokens;
            if (topP !== undefined && topP !== 1.0) geminiGenConfig.topP = topP;

            payload = {
                contents: [
                    { role: "user", parts: [{ text: systemPrompt }] },
                    { role: "model", parts: [{ text: "Understood." }] },
                    { role: "user", parts: [{ text: userPrompt }] }
                ],
                generationConfig: geminiGenConfig
            };
        } else {
            const isCustom = provider === 'custom';
            if (isCustom) {
                const baseUrl = document.getElementById('custom-api-url')?.value || Config?.API_URL_CUSTOM || '';
                url = baseUrl.replace(/\/$/, '') + '/chat/completions';
            } else {
                url = 'https://openrouter.ai/api/v1/chat/completions';
            }

            headers = {
                'Content-Type': 'application/json',
                ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
                ...(provider === 'openrouter' && { 'HTTP-Referer': window.location.origin })
            };

            payload = {
                model: modelName,
                messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }]
            };

            // Use proper response format for each provider
            if (isCustom) {
                // LMStudio and similar require json_schema format
                payload.response_format = {
                    type: 'json_schema',
                    json_schema: this._constructJsonSchema(generationConfig)
                };
            } else {
                // OpenRouter supports json_object
                payload.response_format = { type: 'json_object' };
            }

            if (temp !== undefined && temp !== 0.7) payload.temperature = temp;
            if (maxTokens && maxTokens !== 1000) payload.max_tokens = maxTokens;
            if (topP !== undefined && topP !== 1.0) payload.top_p = topP;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return { result: await response.json(), request: { url, payload } };
    },

    /**
     * Helper to parse test response based on provider format.
     */
    _parseTestResponse(provider, result) {
        try {
            let contentStr;
            if (provider === 'gemini') {
                contentStr = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } else {
                contentStr = result.choices?.[0]?.message?.content || '';
            }

            contentStr = contentStr.trim();
            const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(contentStr);
            if (match) contentStr = match[1];

            const parsed = JSON.parse(contentStr);
            // Handle wrapped responses
            if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * Helper to extract raw content from response.
     */
    _extractRawContent(result, provider) {
        if (provider === 'gemini') {
            return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        return result.choices?.[0]?.message?.content || '';
    }
};
