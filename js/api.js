// @ts-nocheck
import { Config } from './config.js';

export const Api = {
    activeController: null,

    async _makeRequest(globalPrompt, userPrompt, generationConfig) {
        if (this.activeController) this.activeController.abort();
        this.activeController = new AbortController();

        try {
            const { url, payload, headers } = this._prepareRequest(globalPrompt, userPrompt, generationConfig);
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.any([this.activeController.signal, AbortSignal.timeout(30000)])
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
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

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.any([this.activeController.signal, AbortSignal.timeout(60000)])
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            // Parse SSE stream
            const reader = response.body.getReader();
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
        const userPrompt = `Category Path: '${readablePath}'\nExisting Wildcards: ${existingWords.slice(0, 50).join(', ')}\nCustom Instructions: "${customInstructions.trim()}"`;
        const generationConfig = { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } };

        const { result } = await this._makeRequest(systemPrompt, userPrompt, generationConfig);
        return this._parseResponse(result);
    },

    async suggestItems(parentPath, structure, suggestItemPrompt) {
        const readablePath = parentPath ? parentPath.replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top-Level';
        const globalPrompt = suggestItemPrompt.replace('{parentPath}', readablePath);
        const userPrompt = `For context, here are the existing sibling items at the same level:\n${JSON.stringify(structure, null, 2)}\n\nPlease provide new suggestions for the '${readablePath}' category.`;
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

        // Common Parameters from Config
        const temp = Config.MODEL_TEMPERATURE ?? 0.7;
        const maxTokens = Config.MODEL_MAX_TOKENS ?? 1000;
        const topP = Config.MODEL_TOP_P ?? 1.0;
        const topK = Config.MODEL_TOP_K ?? 0;

        if (endpoint === 'gemini') {
            apiKey = getKey('gemini-api-key');
            const model = getVal('gemini-model-name') || 'gemini-1.5-flash';
            if (!apiKey) throw new Error("Gemini API key is not provided.");
            url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const geminiGenConfig = {
                temperature: temp,
                maxOutputTokens: maxTokens,
                topP: topP,
                ...generationConfig // Allow overrides
            };
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
                ],
                temperature: temp,
                max_tokens: maxTokens,
                top_p: topP
            };

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

            payload.response_format = { type: "json_object" };
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

        // Realistic test prompt simulating actual usage
        const testPrompt = `You are a wildcard generator for Stable Diffusion prompts.
Generate exactly 5 unique wildcard items for the category "fantasy_creatures > mythical_beasts".
Existing items: dragon, phoenix, unicorn, griffin.
Custom instructions: "Focus on lesser-known mythological creatures."

Respond with ONLY a valid JSON array of strings, no other text.
Example: ["kirin", "thunderbird", "basilisk"]`;

        try {
            let url, headers, payload;

            const temp = Config.MODEL_TEMPERATURE ?? 0.7;
            const maxTokens = Config.MODEL_MAX_TOKENS ?? 1000;
            const topP = Config.MODEL_TOP_P ?? 1.0;
            const topK = Config.MODEL_TOP_K ?? 0;

            if (provider === 'gemini') {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                headers = { 'Content-Type': 'application/json' };

                const geminiGenConfig = {
                    responseMimeType: 'application/json',
                    responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
                    temperature: temp,
                    maxOutputTokens: maxTokens,
                    topP: topP
                };
                if (topK > 0) geminiGenConfig.topK = topK;

                payload = {
                    contents: [{ parts: [{ text: testPrompt }] }],
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
                    messages: [{ role: 'user', content: testPrompt }],
                    response_format: { type: 'json_object' },
                    temperature: temp,
                    max_tokens: maxTokens,
                    top_p: topP
                };

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

            // Retry if 400 error regarding JSON mode
            if (!reqResult.ok && reqResult.status === 400 &&
                (reqResult.text.includes('JSON mode') || reqResult.text.includes('not supported') || reqResult.text.includes('INVALID_ARGUMENT')) &&
                payload.response_format) {

                console.warn("JSON mode failed, retrying without response_format...");
                delete payload.response_format;
                reqResult = await makeRequest(payload);
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
                    // If the user requested an array but got an object, strictly speaking that's a "No" for "Returns Array", 
                    // but "JSON Support" usually means "Can output valid JSON".
                    // The prompt asked for "ONLY a valid JSON array".
                    // However, 'json_object' mode often forces an object wrapper. 
                    // Let's accept Object as "Supports JSON" but maybe note the count is 0 if not array.
                    supportsJson = true;

                    // Try to find array for count
                    const values = Object.values(parsedContent);
                    const foundArray = values.find(v => Array.isArray(v));
                    if (foundArray) {
                        parsedContent = foundArray; // Use this for count
                    } else {
                        parsedContent = []; // Valid JSON but not containing our items
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
    }
};
