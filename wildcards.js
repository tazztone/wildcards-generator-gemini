        // =================================================================================
        // --- CONFIGURATION & CONSTANTS
        // =================================================================================
        import YAML from 'https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js';

        let Config = {};

        // =================================================================================
        // --- UTILITY FUNCTIONS
        // =================================================================================
        const sanitize = (input) => {
            const temp = document.createElement('div');
            temp.textContent = input;
            return temp.innerHTML;
        };

        const debounce = (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => { clearTimeout(timeout); func(...args); };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        };

        // =================================================================================
        // --- STATE MANAGEMENT MODULE
        // =================================================================================
        const State = {
            appState: { systemPrompt: '', suggestItemPrompt: '', wildcards: {} },
            history: [],
            historyIndex: -1,
            _debounceTimeout: null,
            async init() {
                await this.loadConfig(); // Load config first
                this.loadState();
                if (!localStorage.getItem(Config.STORAGE_KEY)) {
                    this.resetState(false); 
                }
                this.loadHistory();
                this.initializeModelSelector();
            },
            async loadConfig() {
                try {
                    // Fetch the default config from the external file
                    const response = await fetch('config.json');
                    if (!response.ok) throw new Error('Could not fetch default configuration.');
                    const defaultConfig = await response.json();
                    
                    // Load user-saved config from localStorage
                    const savedConfig = localStorage.getItem(defaultConfig.CONFIG_STORAGE_KEY);
                    
                    // Merge configs: defaults < saved
                    Object.assign(Config, defaultConfig, savedConfig ? JSON.parse(savedConfig) : {});

                    // Load API keys from the separate, git-ignored file
                    try {
                        const keysResponse = await fetch('api-keys.json');
                        if (keysResponse.ok) {
                            const apiKeys = await keysResponse.json();
                            // These keys are used for the session and are not saved in localStorage
                            Config.API_KEY_GEMINI = apiKeys.API_KEY_GEMINI || '';
                            Config.API_KEY_OPENROUTER = apiKeys.API_KEY_OPENROUTER || '';
                            Config.API_KEY_CUSTOM = apiKeys.API_KEY_CUSTOM || '';
                        }
                    } catch (keyError) {
                        console.info("api-keys.json not found or invalid, API keys can be entered manually.", keyError);
                    }

                } catch (error) {
                    console.error("Failed to load configuration:", error);
                    UI.showNotification(`Error: Could not load configuration. Please ensure config.json is present and valid. Error: ${error.message}`, false);
                    // Fallback to a minimal safe config if everything fails
                    Config = { STORAGE_KEY: 'wildcardGeneratorState_fallback', HISTORY_KEY: 'wildcardGeneratorHistory_fallback', HISTORY_LIMIT: 10 }; 
                }
            },
            async saveConfig() {
                try {
                    // Fetch the default config again to compare against
                    const response = await fetch('config.json');
                    if (!response.ok) throw new Error('Could not fetch default configuration for saving.');
                    const defaultConfig = await response.json();

                    // Create a new object with only the changed values
                    const changedConfig = {};
                    for (const key in Config) {
                        if (key.startsWith('API_KEY')) continue; // Do not save API keys to localStorage

                        // A deep-enough comparison for this app's config structure
                        if (Config.hasOwnProperty(key) && defaultConfig.hasOwnProperty(key) && JSON.stringify(Config[key]) !== JSON.stringify(defaultConfig[key])) {
                            changedConfig[key] = Config[key];
                        }
                    }

                    localStorage.setItem(Config.CONFIG_STORAGE_KEY, JSON.stringify(changedConfig));
                    UI.showNotification('Configuration saved. Some changes may require a reload to apply.');
                } catch (error) {
                    console.error("Failed to save config:", error);
                    UI.showNotification(`Error saving configuration: ${error.message}`);
                }
            },
            updateConfigValue(key, value) {
                // Basic validation
                if (typeof value === 'number' && isNaN(value)) return;
                if (typeof value === 'string' && value.trim() === '') return;

                if (Config.hasOwnProperty(key)) {
                    if (typeof Config[key] === 'number') {
                        Config[key] = Number(value);
                    } else {
                        Config[key] = value;
                    }
                    this.saveConfig();
                }
            },
            resetConfig() {
                localStorage.removeItem(Config.CONFIG_STORAGE_KEY);
                UI.showNotification('Configuration has been reset to defaults. The page will now reload.');
                setTimeout(() => window.location.reload(), 1500);
            },
            initializeModelSelector() {
                this.fetchGeminiModels();
                this.fetchOpenRouterModels();
            },
            async fetchGeminiModels() {
                const modelList = document.getElementById('gemini-model-list');
                const loadingIndicator = document.getElementById('gemini-model-loading-indicator');
                const errorIndicator = document.getElementById('gemini-model-error-indicator');
                const apiKey = document.getElementById('gemini-api-key').value.trim();

                if (!apiKey) {
                    errorIndicator.textContent = 'Please enter a Gemini API key to load models.';
                    errorIndicator.classList.remove('hidden');
                    return;
                }
                
                loadingIndicator.classList.remove('hidden');
                errorIndicator.classList.add('hidden');
                
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                    if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
                    
                    const { models } = await response.json();
                    modelList.innerHTML = '';
                    if (models && models.length > 0) {
                        models
                            .filter(model => model.supportedGenerationMethods.includes("generateContent"))
                            .sort((a, b) => a.displayName.localeCompare(b.displayName))
                            .forEach(model => {
                                const option = document.createElement('option');
                                option.value = model.name.replace('models/', '');
                                option.textContent = model.displayName;
                                modelList.appendChild(option);
                            });
                    } else {
                        errorIndicator.textContent = 'No models available.';
                        errorIndicator.classList.remove('hidden');
                    }
                } catch (error) {
                    errorIndicator.textContent = `Error: ${error.message}`;
                    errorIndicator.classList.remove('hidden');
                } finally {
                    loadingIndicator.classList.add('hidden');
                }
            },
            async fetchOpenRouterModels() {
                const modelList = document.getElementById('openrouter-model-list');
                const loadingIndicator = document.getElementById('openrouter-model-loading-indicator');
                const errorIndicator = document.getElementById('openrouter-model-error-indicator');
                const apiKey = document.getElementById('openrouter-api-key').value.trim();
                if (!apiKey) {
                    errorIndicator.textContent = 'Please enter an OpenRouter API key to load models.';
                    errorIndicator.classList.remove('hidden');
                    return;
                }
                
                loadingIndicator.classList.remove('hidden');
                errorIndicator.classList.add('hidden');
                
                try {
                    const response = await fetch('https://openrouter.ai/api/v1/models');
                    if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
                    
                    const { data } = await response.json();
                    modelList.innerHTML = '';
                    if (data && data.length > 0) {
                        data.sort((a, b) => a.id.localeCompare(b.id));
                        data.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            modelList.appendChild(option);
                        });
                    } else {
                        errorIndicator.textContent = 'No models available.';
                        errorIndicator.classList.remove('hidden');
                    }
                } catch (error) {
                    errorIndicator.textContent = `Error: ${error.message}`;
                    errorIndicator.classList.remove('hidden');
                } finally {
                    loadingIndicator.classList.add('hidden');
                }
            },
            loadState() {
                try {
                    const savedState = localStorage.getItem(Config.STORAGE_KEY);
                    if (savedState) {
                        const parsed = JSON.parse(savedState);
                        if (parsed.wildcards) {
                            this.appState = parsed;
                            // Always load default prompts, ignoring saved ones.
                            this.appState.systemPrompt = Config.DEFAULT_SYSTEM_PROMPT;
                            this.appState.suggestItemPrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                            UI.renderAll();
                            return;
                        }
                    }
                } catch (error) { console.error("Failed to load state, falling back to default.", error); }
            },
            saveState() {
                try {
                    localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(this.appState));
                    UI.announce("State saved.");
                } catch (e) {
                    console.error("Failed to save state", e);
                    UI.showNotification(`Failed to save state: ${e.message}`);
                }
            },
            resetState(notify = true) {
                const performReset = (data) => {
                    this.appState.wildcards = data || {};
                    this.appState.systemPrompt = Config.DEFAULT_SYSTEM_PROMPT;
                    this.appState.suggestItemPrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                    this.saveState();
                    this.clearHistory();
                    this.saveStateToHistory();
                    UI.renderAll();
                    if (notify) UI.showNotification('All categories have been reset.');
                };

                fetch('data/initial-data.yaml')
                    .then(response => {
                        if (!response.ok) throw new Error('Network response was not ok');
                        return response.text();
                    })
                    .then(yamlText => {
                        try {
                            const doc = YAML.parseDocument(yamlText);
                            const appData = App.processYamlNode(doc.contents);
                            performReset(appData);
                        } catch (e) {
                            console.error("Parsing error", e);
                            throw e;
                        }
                    })
                    .catch(error => {
                        console.error("Failed to load initial-data.yaml, resetting to an empty state:", error);
                        performReset(null);
                        if (notify) UI.showNotification("Could not load default data. Resetting to a blank slate.");
                    });
            },
            saveStateToHistory() {
                if (this.historyIndex < this.history.length - 1) {
                    this.history = this.history.slice(0, this.historyIndex + 1);
                }
                this.history.push(JSON.stringify(this.appState));
                if (this.history.length > Config.HISTORY_LIMIT) {
                    this.history.shift();
                }
                this.historyIndex = this.history.length - 1;
                this._saveHistory();
            },
            loadHistory() {
                try {
                    const savedHistory = localStorage.getItem(Config.HISTORY_KEY);
                    if (savedHistory) {
                        this.history = JSON.parse(savedHistory);
                        this.historyIndex = this.history.length - 1;
                    } else {
                        this.history = [JSON.stringify(this.appState)];
                        this.historyIndex = 0;
                    }
                } catch (e) {
                    console.error("Failed to load history", e);
                    this.history = [];
                    this.historyIndex = -1;
                }
            },
            _saveHistory() {
                localStorage.setItem(Config.HISTORY_KEY, JSON.stringify(this.history));
            },
            clearHistory() {
                this.history = [];
                this.historyIndex = -1;
                localStorage.removeItem(Config.HISTORY_KEY);
            },
            undo() {
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.appState = JSON.parse(this.history[this.historyIndex]);
                    this._saveHistory();
                    UI.renderAll();
                    UI.announce("Undo complete.");
                    return true;
                }
                return false;
            },
            redo() {
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.appState = JSON.parse(this.history[this.historyIndex]);
                    this._saveHistory();
                    UI.renderAll();
                    UI.announce("Redo complete.");
                    return true;
                }
                return false;
            }
        };

        // =================================================================================
        // --- API MODULE
        // =================================================================================
        const Api = {
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

            async generateWildcards(globalPrompt, categoryPath, existingWords, customInstructions) {
                const readablePath = categoryPath.replace(/\//g, ' > ').replace(/_/g, ' ');
                const userPrompt = `Category Path: '${readablePath}'\nExisting Wildcards: ${existingWords.slice(0, 50).join(', ')}\nCustom Instructions: "${customInstructions.trim()}"`;
                const generationConfig = { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } };

                const { result } = await this._makeRequest(globalPrompt, userPrompt, generationConfig);
                return this._parseResponse(result);
            },

            async suggestItems(parentPath, structure) {
                const readablePath = parentPath ? parentPath.replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top-Level';
                const globalPrompt = State.appState.suggestItemPrompt.replace('{parentPath}', readablePath);
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

            async testConnection(provider) {
                UI.showNotification(`Testing connection to ${provider}...`);
                try {
                    let url, requestOptions = { method: 'GET' };

                    if (provider === 'gemini') {
                        const apiKey = document.getElementById('gemini-api-key').value.trim();
                        if (!apiKey) throw new Error("Gemini API key not provided.");
                        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
                    } else if (provider === 'openrouter') {
                        url = `https://openrouter.ai/api/v1/models`;
                    } else if (provider === 'custom') {
                        const customUrl = document.getElementById('custom-api-url').value.trim();
                        if (!customUrl) throw new Error("Custom API URL is not provided.");
                        url = `${customUrl.replace(/\/$/, '')}/models`;
                        const apiKey = document.getElementById('custom-api-key').value.trim();
                        const headers = {};
                        if (apiKey) {
                            headers['Authorization'] = `Bearer ${apiKey}`;
                        }
                        if (Object.keys(headers).length > 0) {
                            requestOptions.headers = headers;
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
                    if (provider === 'gemini') {
                        if (!data.models) throw new Error('Invalid response from Gemini API.');
                        successMessage = `Gemini connection successful! Found ${data.models.length} models.`;
                    } else if (provider === 'openrouter') {
                        if (!data.data) throw new Error('Invalid response from OpenRouter API.');
                        successMessage = `OpenRouter connection successful! Found ${data.data.length} models.`;
                    } else if (provider === 'custom') {
                        if (!data.data) throw new Error('Invalid response from custom API. Expected a "data" array.');
                        successMessage = `Custom API connection successful! Found ${data.data.length} models.`;
                        const modelList = document.getElementById('custom-model-list');
                        modelList.innerHTML = '';
                        data.data.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.id;
                            modelList.appendChild(option);
                        });
                    }
                    UI.showNotification(successMessage);

                } catch (error) {
                    console.error("Connection Test Error:", error);
                    let message = `Connection failed: ${error.message}`;
                    if (error instanceof TypeError && error.message === 'Failed to fetch') {
                        message += '\n\nThis is likely a Cross-Origin Resource Sharing (CORS) issue. The API server must send the `Access-Control-Allow-Origin` header for the browser to allow the request. Please check your API server\'s configuration.';
                    }
                    UI.showNotification(message);
                }
            },
            _prepareRequest(globalPrompt, userPrompt, generationConfig = {}) {
                const endpoint = document.getElementById('api-endpoint').value;
                let apiKey, url, payload, headers = { 'Content-Type': 'application/json' };

                if (endpoint === 'gemini') {
                    apiKey = document.getElementById('gemini-api-key').value.trim();
                    const model = document.getElementById('gemini-model-name').value.trim() || 'gemini-1.5-flash';
                    if (!apiKey) throw new Error("Gemini API key is not provided.");
                    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    payload = {
                        contents: [
                            { role: "user", parts: [{ text: globalPrompt }] },
                            { role: "model", parts: [{ text: "Understood." }] },
                            { role: "user", parts: [{ text: userPrompt }] }
                        ],
                        generationConfig: generationConfig
                    };
                } else if (endpoint === 'openrouter') {
                    apiKey = document.getElementById('openrouter-api-key').value.trim();
                    const model = document.getElementById('openrouter-model-name').value.trim() || ":free";
                    if (!apiKey) throw new Error("OpenRouter API key is not provided.");
                    url = `https://openrouter.ai/api/v1/chat/completions`;
                    headers['Authorization'] = `Bearer ${apiKey}`;
                    payload = {
                        model,
                        messages: [
                            { role: "user", content: `${globalPrompt}\n\n${userPrompt}` }
                        ]
                    };
                    payload.response_format = { type: "json_object" };
                } else if (endpoint === 'custom') {
                    apiKey = document.getElementById('custom-api-key').value.trim();
                    const model = document.getElementById('custom-model-name').value.trim();
                    const customUrl = document.getElementById('custom-api-url').value.trim();
                    if (!customUrl) throw new Error("Custom API URL is not provided.");
                    url = `${customUrl.replace(/\/$/, '')}/chat/completions`;
                    if(apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                    payload = {
                        model,
                        messages: [
                            { role: "user", content: `${globalPrompt}\n\n${userPrompt}` }
                        ]
                    };
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
            }
        };

        // =================================================================================
        // --- UI MODULE (with Refactored Rendering)
        // =================================================================================
        const UI = {
            elements: {},
            init() {
                this.elements = {
                    container: document.getElementById('wildcard-container'),
                    globalPrompt: document.getElementById('global-prompt'),
                    suggestItemPrompt: document.getElementById('suggestion-prompt'),
                    geminiApiKey: document.getElementById('gemini-api-key'),
                    openrouterApiKey: document.getElementById('openrouter-api-key'),
                    customApiKey: document.getElementById('custom-api-key'),
                    customApiUrl: document.getElementById('custom-api-url'),
                    geminiModelName: document.getElementById('gemini-model-name'),
                    openrouterModelName: document.getElementById('openrouter-model-name'),
                    customModelName: document.getElementById('custom-model-name'),
                    apiEndpoint: document.getElementById('api-endpoint'),
                    search: document.getElementById('search-wildcards'),
                    searchResultsCount: document.getElementById('search-results-count'),
                    dialog: document.getElementById('notification-dialog'),
                    dialogMessage: document.getElementById('notification-message'),
                    dialogConfirm: document.getElementById('confirm-btn'),
                    dialogCancel: document.getElementById('cancel-btn'),
                    dialogClose: document.getElementById('notification-close'),
                    dialogConfirmButtons: document.getElementById('confirmation-buttons'),
                    ariaLive: document.getElementById('aria-live-region'),
                    // Advanced Config
                    configHistoryLimit: document.getElementById('config-history-limit'),
                    configSearchDebounce: document.getElementById('config-search-debounce'),
                    configStorageKey: document.getElementById('config-storage-key'),
                    configHistoryKey: document.getElementById('config-history-key')
                };
                this.elements.dialog.addEventListener('close', () => {
                    const customButtons = this.elements.dialog.querySelector('#custom-buttons');
                    if(customButtons) customButtons.remove();
                });
            },
            renderAll() {
                const { wildcards, systemPrompt, suggestItemPrompt } = State.appState;
                this.elements.globalPrompt.value = systemPrompt || Config.DEFAULT_SYSTEM_PROMPT;
                this.elements.suggestItemPrompt.value = suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                this.elements.geminiApiKey.value = Config.API_KEY_GEMINI || '';
                this.elements.openrouterApiKey.value = Config.API_KEY_OPENROUTER || '';
                this.elements.customApiKey.value = Config.API_KEY_CUSTOM || '';
                this.elements.customApiUrl.value = Config.API_URL_CUSTOM || '';
                this.elements.geminiModelName.value = Config.MODEL_NAME_GEMINI || 'gemini-1.5-flash';
                this.elements.openrouterModelName.value = Config.MODEL_NAME_OPENROUTER || ':free';
                this.elements.customModelName.value = Config.MODEL_NAME_CUSTOM || '';

                // Populate advanced config fields
                this.elements.configHistoryLimit.value = Config.HISTORY_LIMIT;
                this.elements.configSearchDebounce.value = Config.SEARCH_DEBOUNCE_DELAY;
                this.elements.configStorageKey.value = Config.STORAGE_KEY;
                this.elements.configHistoryKey.value = Config.HISTORY_KEY;
                
                const openPaths = [...this.elements.container.querySelectorAll('details[open]')].map(d => d.dataset.path);

                this.elements.container.innerHTML = '';
                const fragment = document.createDocumentFragment();
                const sortedKeys = Object.keys(wildcards).sort();
                
                sortedKeys.forEach((key, index) => {
                    const element = this.createCategoryElement(key, wildcards[key], 0, key, index);
                    fragment.appendChild(element);
                });
                fragment.appendChild(this.createPlaceholderCategory());
                this.elements.container.appendChild(fragment);

                openPaths.forEach(path => {
                    const el = this.elements.container.querySelector(`details[data-path="${path}"]`);
                    if (el) el.open = true;
                });
            },
            createCategoryElement(name, data, level, path, index) {
                const element = document.createElement('details');
                element.className = `bg-gray-800 rounded-lg shadow-md group ${level > 0 ? 'ml-4 mt-2' : ''}`;
                if (level === 0) {
                     element.classList.add(`category-tint-${(index % 10) + 1}`);
                }
                element.dataset.path = path;
                element.draggable = true;
                
                element.innerHTML = this.getCategoryFolderHtml(name, data, path);
                const contentWrapper = element.querySelector('.content-wrapper');
                
                const sortedKeys = Object.keys(data).filter(k => k !== 'instruction').sort();
                
                const leafNodes = [];
                const nonLeafNodes = [];

                for (const key of sortedKeys) {
                    const childData = data[key];
                    const childIsLeaf = childData && typeof childData === 'object' && Array.isArray(childData.wildcards);
                    const childPath = `${path}/${key}`;

                    if (childIsLeaf) {
                        leafNodes.push(this.createWildcardCardElement(key, childData, level + 1, childPath));
                    } else if (typeof childData === 'object' && childData !== null) {
                        nonLeafNodes.push(this.createCategoryElement(key, childData, level + 1, childPath, 0));
                    }
                }

                const gridWrapper = document.createElement('div');
                gridWrapper.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full';
                
                nonLeafNodes.forEach(node => contentWrapper.appendChild(node));
                leafNodes.forEach(node => gridWrapper.appendChild(node));
                
                gridWrapper.appendChild(this.createWildcardPlaceholder(path));
                contentWrapper.appendChild(gridWrapper);

                return element;
            },
            createWildcardCardElement(name, data, level, path) {
                const element = document.createElement('div');
                element.className = `bg-gray-700/50 p-4 rounded-lg flex flex-col`;
                element.dataset.path = path;
                element.draggable = true;
                element.innerHTML = this.getWildcardCardHtml(name, data, path);
                return element;
            },
            createWildcardPlaceholder(parentPath) {
                const placeholder = document.createElement('div');
                placeholder.className = 'bg-gray-700/50 p-4 rounded-lg flex flex-col min-h-[288px]';
                placeholder.dataset.parentPath = parentPath;
                placeholder.innerHTML = `
                    <div class="flex-grow flex flex-col items-center justify-center text-center">
                         <p class="text-gray-400 mb-4">Add new wildcard list</p>
                         <div class="flex gap-4">
                            <button class="add-wildcard-list-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-2xl" title="Add new wildcard list">+</button>
                            <button class="suggest-wildcard-list-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md" title="Suggest new wildcard list">Suggest</button>
                        </div>
                    </div>
                `;
                return placeholder;
            },
            
            createPlaceholderCategory() {
                const placeholderWrapper = document.createElement('div');
                placeholderWrapper.className = 'bg-gray-800 rounded-lg shadow-md mt-4';
                placeholderWrapper.innerHTML = `
                    <div class="p-4 flex flex-wrap justify-between items-center gap-4">
                        <h2 class="text-xl sm:text-2xl font-semibold text-indigo-400">Add New Top-Level Category</h2>
                        <div class="flex items-center gap-2">
                            <button id="add-category-placeholder-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md" title="Add new category">+</button>
                            <button id="suggest-toplevel-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md" title="Suggest new categories using AI">Suggest</button>
                        </div>
                    </div>`;
                return placeholderWrapper;
            },
            createChip(wildcard, index) { return `<div class="chip bg-indigo-500/50 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap" data-index="${index}"><input type="checkbox" class="batch-select bg-gray-700 border-gray-500 text-indigo-600 focus:ring-indigo-500"><span contenteditable="true" class="outline-none focus:bg-indigo-400/50 rounded px-1">${sanitize(wildcard)}</span></div>`; },
            getCategoryFolderHtml(name, data, path) {
                return `
                    <summary class="flex justify-between items-center p-4 cursor-pointer gap-4">
                        <div class="flex items-center gap-3 flex-wrap flex-grow">
                            <h2 class="text-xl font-semibold text-indigo-400"><span contenteditable="true" class="category-name outline-none focus:bg-indigo-400/50 rounded px-1">${name.replace(/_/g, ' ')}</span></h2>
                            <button class="delete-btn text-red-400 hover:text-red-300 font-bold text-xl leading-none" title="Delete this category">&times;</button>
                            <input type="text" class="custom-instructions-input bg-gray-700 text-sm border border-gray-600 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 flex-grow" placeholder="Folder instructions..." style="min-width: 200px;" value="${sanitize(data.instruction || '')}" onclick="event.stopPropagation();">
                        </div>
                        <div class="flex items-center gap-2 ml-auto flex-shrink-0">
                            <button class="add-subcategory-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 text-sm rounded-md" title="Add new folder">+</button>
                            <button class="suggest-subcategory-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-2 text-sm rounded-md" title="Suggest new items for this category">Suggest</button>
                            <span class="arrow-down transition-transform duration-300 text-indigo-400"><svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                        </div>
                    </summary>
                    <div class="content-wrapper p-4 border-t border-gray-700 flex flex-col gap-4"></div>
                `;
            },
            getWildcardCardHtml(name, data, path) {
                return `
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-bold text-lg text-gray-100"><span contenteditable="true" class="wildcard-name outline-none focus:bg-indigo-400/50 rounded px-1">${name.replace(/_/g, ' ')}</span> <span class="wildcard-count text-gray-400 text-sm ml-2">(${(data.wildcards || []).length})</span></h3>
                        <button class="delete-btn text-red-400 hover:text-red-300 font-bold text-xl leading-none" title="Delete this card">&times;</button>
                    </div>
                    <input type="text" class="custom-instructions-input bg-gray-800 text-sm border border-gray-600 rounded-md px-2 py-1 w-full my-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Custom generation instructions..." value="${sanitize(data.instruction || '')}">
                    <div class="chip-container custom-scrollbar flex flex-wrap gap-2 bg-gray-800 rounded-md p-2 w-full border border-gray-600 overflow-y-auto" style="height: 150px;">
                        ${(data.wildcards || []).map((wc, i) => this.createChip(wc, i)).join('')}
                    </div>
                    <div class="flex gap-2 mt-2">
                        <input type="text" placeholder="Add new wildcard..." class="add-wildcard-input flex-grow bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-sm">
                        <button class="add-wildcard-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-md">+</button>
                    </div>
                    <div class="flex justify-between items-center mt-3 flex-wrap gap-2">
                        <button class="generate-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center gap-2"><span class="btn-text">Generate More</span><div class="loader hidden"></div></button>
                        <button class="copy-btn text-gray-400 hover:text-white" title="Copy all wildcards"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                        <button class="select-all-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-2 px-3 rounded-md">Select All</button>
                        <button class="batch-delete-btn bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded-md">Delete Selected</button>
                    </div>
                `;
            },
            updateCardByPath(path) {
                const card = this.elements.container.querySelector(`[data-path="${path}"]`);
                if (!card) return;
                const data = App.getObjectByPath(path);
                if (!data) return;
                card.querySelector('h3 .text-gray-400').textContent = `(${(data.wildcards || []).length})`;
                card.querySelector('.chip-container').innerHTML = (data.wildcards || []).map((wc, i) => this.createChip(wc, i)).join('');
            },
            showNotification(message, isConfirmation = false, onConfirm = null, withInput = false) {
                this.elements.dialogMessage.innerHTML = '';
                let inputElement = null;

                if (message.trim().startsWith('<')) {
                    this.elements.dialogMessage.innerHTML = message;
                } else {
                    const p = document.createElement('p');
                    p.textContent = message;
                    this.elements.dialogMessage.appendChild(p);
                }

                if (withInput) {
                    inputElement = document.createElement('input');
                    inputElement.type = 'text';
                    inputElement.className = 'bg-gray-900 border border-gray-600 rounded-md p-2 text-sm w-full mt-4';
                    this.elements.dialogMessage.appendChild(inputElement);
                    inputElement.focus();
                }
                
                this.elements.dialogConfirmButtons.classList.toggle('hidden', !isConfirmation);
                this.elements.dialogClose.classList.toggle('hidden', isConfirmation);
                this.elements.dialog.showModal();
                
                this.elements.dialogConfirm.onclick = () => {
                    this.elements.dialog.close('confirm');
                    if (onConfirm) onConfirm(inputElement ? inputElement.value : null);
                };
                this.elements.dialogCancel.onclick = () => this.elements.dialog.close('cancel');
                this.elements.dialogClose.onclick = () => this.elements.dialog.close('close');
            },
            announce(message) { this.elements.ariaLive.textContent = message; },
            toggleGenerateButton(btn, isLoading) {
                const btnText = btn.querySelector('.btn-text'); const loader = btn.querySelector('.loader');
                btnText.textContent = isLoading ? 'Cancel' : 'Generate More';
                loader.classList.toggle('hidden', !isLoading);
                btn.classList.toggle('bg-indigo-600', !isLoading); btn.classList.toggle('hover:bg-indigo-700', !isLoading);
                btn.classList.toggle('bg-yellow-600', isLoading); btn.classList.toggle('hover:bg-yellow-700', isLoading);
            }
        };

        // =================================================================================
        // --- MAIN APPLICATION MODULE (CONTROLLER)
        // =================================================================================
        const App = {
            draggedPath: null,
            async init() {
                UI.init();
                await State.init();
                this.bindEventListeners();
                this.debouncedSearch = debounce(this.handleSearch, Config.SEARCH_DEBOUNCE_DELAY);
            },
            
            bindEventListeners() {
                const elements = UI.elements;
                elements.globalPrompt.addEventListener('change', e => { State.appState.systemPrompt = e.target.value; State.saveState(); });
                elements.suggestItemPrompt.addEventListener('change', e => { State.appState.suggestItemPrompt = e.target.value; State.saveState(); });
                elements.geminiApiKey.addEventListener('change', e => { Config.API_KEY_GEMINI = e.target.value.trim(); State.fetchGeminiModels(); });
                elements.openrouterApiKey.addEventListener('change', e => { Config.API_KEY_OPENROUTER = e.target.value.trim(); State.fetchOpenRouterModels(); });
                elements.customApiKey.addEventListener('change', e => Config.API_KEY_CUSTOM = e.target.value.trim());
                elements.customApiUrl.addEventListener('change', e => State.updateConfigValue('API_URL_CUSTOM', e.target.value.trim()));
                elements.geminiModelName.addEventListener('change', e => State.updateConfigValue('MODEL_NAME_GEMINI', e.target.value.trim()));
                elements.openrouterModelName.addEventListener('change', e => State.updateConfigValue('MODEL_NAME_OPENROUTER', e.target.value.trim()));
                elements.customModelName.addEventListener('change', e => State.updateConfigValue('MODEL_NAME_CUSTOM', e.target.value.trim()));

                // Advanced Config Listeners
                elements.configHistoryLimit.addEventListener('change', e => State.updateConfigValue('HISTORY_LIMIT', parseInt(e.target.value, 10)));
                elements.configSearchDebounce.addEventListener('change', e => State.updateConfigValue('SEARCH_DEBOUNCE_DELAY', parseInt(e.target.value, 10)));
                elements.configStorageKey.addEventListener('change', e => State.updateConfigValue('STORAGE_KEY', e.target.value));
                elements.configHistoryKey.addEventListener('change', e => State.updateConfigValue('HISTORY_KEY', e.target.value));


                document.querySelectorAll('.toggle-api-key-visibility').forEach(button => {
                    button.addEventListener('click', () => {
                        const input = button.previousElementSibling;
                        const eyeSlash = button.querySelector('.eye-slash');
                        const isHidden = input.type === 'password';
                        input.type = isHidden ? 'text' : 'password';
                        eyeSlash.style.display = isHidden ? 'none' : 'block';
                        button.title = isHidden ? 'Hide API Key' : 'Show API Key';
                    });
                });

                elements.search.addEventListener('input', e => this.debouncedSearch(e.target.value));
                document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
                
                document.addEventListener('click', e => {
                    if (e.target.matches('.test-connection-btn')) {
                        e.preventDefault();
                        const provider = e.target.dataset.provider;
                        Api.testConnection(provider);
                    }
                    if (e.target.matches('#add-category-placeholder-btn')) this.handleAddNewCategory();
                    if (e.target.matches('#suggest-toplevel-btn')) this.handleSuggestItems(null, 'folder');
                    if (e.target.matches('#download-all-zip')) this.handleDownloadZip();
                    if (e.target.matches('#export-yaml')) this.handleExportYaml();
                    if (e.target.matches('#import-yaml')) this.handleImportYaml();
                    if (e.target.matches('#export-config')) this.handleExportConfig();
                    if (e.target.matches('#import-config')) this.handleImportConfig();
                    if (e.target.matches('#undo-btn')) State.undo();
                    if (e.target.matches('#redo-btn')) State.redo();
                    if (e.target.matches('#help-btn')) this.handleHelp();
                    if (e.target.matches('#reset-btn')) UI.showNotification('Are you sure you want to reset everything?', true, () => State.resetState());
                });

                elements.container.addEventListener('click', this.handleContainerClick.bind(this));
                elements.container.addEventListener('change', e => { if (e.target.matches('.custom-instructions-input')) { const path = e.target.closest('[data-path]').dataset.path; this.getObjectByPath(path).instruction = e.target.value; State.saveState(); } });
                elements.container.addEventListener('keydown', e => { if (e.key === 'Enter') { if (e.target.matches('.add-wildcard-input')) { e.preventDefault(); e.target.nextElementSibling.click(); } if (e.target.matches('[contenteditable="true"]')) { e.preventDefault(); e.target.blur(); } } });
                elements.container.addEventListener('blur', e => { if (e.target.matches('[contenteditable="true"]')) this.handleContentEditableBlur(e.target); }, true);
                
                const container = elements.container;
                container.addEventListener('dragstart', this.handleDragStart.bind(this));
                container.addEventListener('dragover', this.handleDragOver.bind(this));
                container.addEventListener('dragleave', this.handleDragLeave.bind(this));
                container.addEventListener('drop', this.handleDrop.bind(this));
                container.addEventListener('dragend', this.handleDragEnd.bind(this));
            },
            processYamlNode(node) {
                if (YAML.isMap(node)) {
                    const result = {};
                    node.items.forEach(pair => {
                        const key = pair.key.value;
                        const valueNode = pair.value;

                        let rawComment = "";
                        // Check multiple locations for the comment
                        if (valueNode && valueNode.commentBefore) {
                             rawComment = valueNode.commentBefore;
                        } else if (valueNode && valueNode.comment) {
                            rawComment = valueNode.comment;
                        } else if (pair.key && pair.key.comment) {
                            rawComment = pair.key.comment;
                        } else if (pair.key && pair.key.commentBefore) {
                            rawComment = pair.key.commentBefore;
                        }

                        let instruction = "";
                        if (rawComment) {
                             let cleaned = rawComment.trim();
                             if (cleaned.startsWith('#')) {
                                 cleaned = cleaned.substring(1).trim();
                             }

                             if (cleaned.startsWith('instruction:')) {
                                 instruction = cleaned.replace(/^instruction:\s*/, '').trim();
                             }
                        }

                        const processedValue = this.processYamlNode(valueNode);

                        if (typeof processedValue === 'object' && !Array.isArray(processedValue)) {
                             processedValue.instruction = instruction;
                             result[key] = processedValue;
                        } else if (Array.isArray(processedValue)) {
                            result[key] = {
                                instruction: instruction,
                                wildcards: processedValue
                            };
                        } else {
                             result[key] = {
                                 instruction: instruction,
                                 wildcards: [String(processedValue)]
                             };
                        }
                    });
                    return result;
                } else if (YAML.isSeq(node)) {
                    return node.items.map(item => (item && item.value !== undefined) ? item.value : item);
                } else if (YAML.isScalar(node)) {
                    return node.value;
                }
                return {};
            },
            getStructureForPrompt(obj) {
                const result = {};
                for (const key in obj) {
                    if (key === 'instruction') continue; // Skip instruction property at this level
                    const value = obj[key];
                    if (value && typeof value === 'object') {
                        if (Array.isArray(value.wildcards)) {
                            result[key] = { instruction: value.instruction || '' };
                        } else {
                            result[key] = this.getStructureForPrompt(value);
                            if(value.instruction) {
                                result[key].instruction = value.instruction;
                            }
                        }
                    }
                }
                return result;
            },
            getObjectByPath(path) {
                if (!path) return State.appState.wildcards;
                return path.split('/').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, State.appState.wildcards);
            },
            getParentObjectByPath(path) {
                if (!path || !path.includes('/')) return State.appState.wildcards;
                const parentPath = path.substring(0, path.lastIndexOf('/'));
                return this.getObjectByPath(parentPath);
            },
            handleKeyboardShortcuts(e) {
                if (e.ctrlKey || e.metaKey) {
                    switch (e.key.toLowerCase()) {
                        case 's': e.preventDefault(); UI.showNotification('All changes are saved automatically.'); break;
                        case 'z': e.preventDefault(); State.undo(); break;
                        case 'y': e.preventDefault(); State.redo(); break;
                    }
                }
            },
            handleContainerClick(e) {
                const target = e.target;
                const pathElement = target.closest('[data-path]');
                const placeholderElement = target.closest('[data-parent-path]');

                if (placeholderElement) {
                    const parentPath = placeholderElement.dataset.parentPath;
                    if (target.matches('.add-wildcard-list-btn')) {
                        this.handleCreateItem(parentPath, 'list');
                    } else if (target.matches('.suggest-wildcard-list-btn')) {
                        this.handleSuggestItems(parentPath, 'list');
                    }
                    return;
                }
                
                if (!pathElement) return;
                const path = pathElement.dataset.path;

                if (target.closest('.add-subcategory-btn')) { e.preventDefault(); this.handleCreateItem(path, 'folder'); return; }
                if (target.closest('.suggest-subcategory-btn')) { e.preventDefault(); this.handleSuggestItems(path, 'folder'); return; }
                if (target.closest('.delete-btn')) { e.preventDefault(); this.handleDelete(path); return; }
                
                if (target.closest('.generate-btn')) {
                    this.handleGenerate(target.closest('.generate-btn'), path);
                }
                if (target.closest('.copy-btn')) this.handleCopy(path);
                if (target.closest('.add-wildcard-btn')) this.handleAddWildcard(pathElement, path);
                if (target.closest('.batch-delete-btn')) this.handleBatchDelete(pathElement, path);
                if (target.closest('.select-all-btn')) this.handleSelectAll(pathElement, target.closest('.select-all-btn'));
            },
            handleContentEditableBlur(target) {
                const element = target.closest('[data-path]');
                if (!element) return;

                const path = element.dataset.path;
                const isChip = target.closest('.chip');
                
                if (isChip) {
                    const index = parseInt(isChip.dataset.index, 10);
                    const dataObject = this.getObjectByPath(path);
                    const originalText = dataObject.wildcards[index];
                    const newText = target.textContent.trim();
                    if (newText && newText !== originalText) {
                        State.saveStateToHistory();
                        dataObject.wildcards[index] = newText;
                        dataObject.wildcards.sort((a, b) => a.localeCompare(b));
                        State.saveState();
                        UI.updateCardByPath(path); // Re-render to reflect potential sort change
                    } else {
                        target.textContent = originalText;
                    }
                } else { // It's a category/card title
                    const parentObject = this.getParentObjectByPath(path);
                    const oldKey = path.split('/').pop();
                    const oldText = oldKey.replace(/_/g, ' ');
                    const newText = target.textContent.trim();
                    
                    if (!newText || newText === oldText) {
                         target.textContent = oldText;
                         return;
                    }
                    const newKey = newText.replace(/\s+/g, '_');

                    if (parentObject[newKey]) {
                        UI.showNotification(`An item named "${newText}" already exists here.`);
                        target.textContent = oldText;
                        return;
                    }
                    State.saveStateToHistory();
                    const data = parentObject[oldKey];
                    delete parentObject[oldKey];
                    parentObject[newKey] = data;
                    State.saveState();
                    UI.renderAll();
                    UI.announce(`Renamed "${oldText}" to "${newText}".`);
                }
            },
            async handleGenerate(btn, path) {
                if (Api.activeController) { Api.activeController.abort(); UI.toggleGenerateButton(btn, false); return; }
                const endpoint = document.getElementById('api-endpoint').value;
                const key = endpoint === 'gemini' ? UI.elements.geminiApiKey.value : UI.elements.openrouterApiKey.value;
                if (!key.trim()) {
                    UI.showNotification(`Please add an API key for ${endpoint === 'gemini' ? 'Gemini' : 'OpenRouter'} in the Global Settings to use this feature.`);
                    return;
                }

                UI.toggleGenerateButton(btn, true);
                try {
                    const dataObject = this.getObjectByPath(path);
                    const newWildcards = await Api.generateWildcards(State.appState.systemPrompt, path, dataObject.wildcards, dataObject.instruction);
                    
                    if (newWildcards && newWildcards.length > 0) {
                        const generatePopup = document.getElementById('generatePopup');
                        const generateList = document.getElementById('generateList');
                        generateList.innerHTML = ''; // Clear previous results

                        const existingSet = new Set(dataObject.wildcards.map(w => w.toLowerCase()));
                        const uniqueNew = newWildcards.filter(w => w && !existingSet.has(w.toLowerCase()));

                        if (uniqueNew.length === 0) {
                            UI.showNotification("The AI didn't generate any new unique wildcards.");
                            return;
                        }

                        uniqueNew.forEach(wildcard => {
                            const li = document.createElement('li');
                            li.className = 'suggest-card'; // Re-use existing styles
                            li.setAttribute('role', 'checkbox');
                            li.setAttribute('aria-checked', 'true'); // Default to selected
                            li.setAttribute('tabindex', '0');
                            li.dataset.wildcard = wildcard;
                            li.innerHTML = `<h3>${sanitize(wildcard)}</h3>`;
                            li.addEventListener('click', () => {
                                const selected = li.getAttribute('aria-checked') === 'true';
                                li.setAttribute('aria-checked', String(!selected));
                            });
                            generateList.appendChild(li);
                        });

                        generatePopup.dataset.path = path;
                        generatePopup.showModal();
                    } else {
                        UI.showNotification("The AI didn't return any wildcards.");
                    }
                } catch (error) {
                    console.error("Generation error:", error);
                    UI.showNotification(`Error: ${error.message || "An unknown error occurred."}`);
                } finally {
                    if (!Api.activeController) UI.toggleGenerateButton(btn, false);
                }
            },
            async handleSuggestItems(path, type) {
                const endpoint = document.getElementById('api-endpoint').value;
                const key = endpoint === 'gemini' ? UI.elements.geminiApiKey.value : UI.elements.openrouterApiKey.value;
                if (!key.trim()) {
                    UI.showNotification(`Please add an API key for ${endpoint === 'gemini' ? 'Gemini' : 'OpenRouter'} in the Global Settings to use this feature.`);
                    return;
                }

                const parentObject = this.getParentObjectByPath(path);
                const structure = this.getStructureForPrompt(parentObject);
                UI.showNotification('Asking AI for suggestions...');
                
                try {
                    const { suggestions, request } = await Api.suggestItems(path, structure);
                    if (!suggestions || suggestions.length === 0) {
                        UI.showNotification('The AI did not return any suggestions. Please try again.');
                        return;
                    }

                    // Clear existing suggestions
                    const suggestList = document.getElementById('suggestList');
                    suggestList.innerHTML = '';

                    // Populate new suggestions and bind events
                    suggestions.forEach(suggestion => {
                        const li = document.createElement('li');
                        li.className = 'suggest-card';
                        li.setAttribute('role', 'checkbox');
                        li.setAttribute('aria-checked', 'false');
                        li.setAttribute('tabindex', '0');
                        li.innerHTML = `
                            <h3>${sanitize(suggestion.name.replace(/_/g, ' '))}</h3>
                            <p>${sanitize(suggestion.instruction)}</p>
                        `;
                        li.dataset.name = sanitize(suggestion.name);
                        li.dataset.instruction = sanitize(suggestion.instruction);
                        // Bind events directly to each card
                        li.addEventListener('click', toggle);
                        li.addEventListener('keydown', e => {
                            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle.call(li); }
                        });
                        suggestList.appendChild(li);
                    });

                    // Close the "Asking..." notification before showing the new popup
                    UI.elements.dialog.close();

                    // Show the suggestions popup
                    const suggestPopup = document.getElementById('suggestPopup');
                    suggestPopup.showModal();
                    // Store the path for use in confirm action
                    suggestPopup.dataset.currentPath = path;
                    // Store request for API details link
                    if (request) {
                        suggestPopup.dataset.apiRequest = JSON.stringify(request, null, 2);
                    } else {
                        delete suggestPopup.dataset.apiRequest;
                    }
                } catch (error) {
                    console.error("Suggestion error:", error);
                    UI.showNotification(`Error: ${error.message || "An unknown error occurred."}`);
                }
            },
            handleCopy(path) { const content = this.getObjectByPath(path).wildcards.join('\n'); navigator.clipboard.writeText(content).then(() => UI.showNotification('Copied!')).catch(() => UI.showNotification('Failed to copy.')); },
            handleAddWildcard(card, path) {
                const input = card.querySelector('.add-wildcard-input'); const value = input.value.trim();
                if (value) { 
                    State.saveStateToHistory(); 
                    const dataObject = this.getObjectByPath(path);
                    dataObject.wildcards.push(value);
                    dataObject.wildcards.sort((a, b) => a.localeCompare(b));
                    State.saveState(); 
                    UI.updateCardByPath(path); 
                    input.value = ''; 
                    input.focus(); 
                }
            },
            handleBatchDelete(card, path) {
                const checkboxes = card.querySelectorAll('.batch-select:checked'); if (checkboxes.length === 0) return;
                UI.showNotification(`Delete ${checkboxes.length} selected items?`, true, () => {
                    State.saveStateToHistory();
                    const indicesToDelete = Array.from(checkboxes).map(cb => parseInt(cb.closest('.chip').dataset.index, 10));
                    const dataObject = this.getObjectByPath(path);
                    dataObject.wildcards = dataObject.wildcards.filter((_, i) => !indicesToDelete.includes(i));
                    State.saveState(); UI.updateCardByPath(path); UI.announce(`Deleted ${indicesToDelete.length} wildcards.`);
                });
            },
            handleDelete(path) {
                const keyToDelete = path.split('/').pop();
                const parentObject = this.getParentObjectByPath(path);
                UI.showNotification(`Delete "${keyToDelete.replace(/_/g, ' ')}"? This cannot be undone.`, true, () => {
                    State.saveStateToHistory();
                    delete parentObject[keyToDelete];
                    State.saveState();
                    UI.renderAll();
                    UI.announce(`Item deleted.`);
                });
            },
            handleSelectAll(card, button) { const checkboxes = card.querySelectorAll('.batch-select'); const isSelectAll = button.textContent === 'Select All'; checkboxes.forEach(cb => cb.checked = isSelectAll); button.textContent = isSelectAll ? 'Deselect All' : 'Select All'; },
            handleAddNewCategory() {
                UI.showNotification('Enter new top-level category name:', true, (name) => {
                    if (name && name.trim()) {
                        const sanitizedName = name.trim().replace(/\s+/g, '_');
                        if (State.appState.wildcards[sanitizedName]) { UI.showNotification(`Category "${sanitizedName}" already exists.`); return; }
                        State.saveStateToHistory(); State.appState.wildcards[sanitizedName] = {}; State.saveState(); UI.renderAll();
                    }
                }, true);
            },
            handleCreateItem(path, type) {
                const parentObject = this.getObjectByPath(path);
                const parentName = path ? path.split('/').pop().replace(/_/g, ' ') : 'Top-Level';
                const itemType = type === 'list' ? 'wildcard list' : 'folder';

                UI.showNotification(`Enter name for new ${itemType} in "${parentName}":`, true, (name) => {
                    if (!name || !name.trim()) return;
                    const sanitizedName = name.trim().replace(/\s+/g, '_');
                    if (parentObject[sanitizedName]) {
                        UI.showNotification(`"${sanitizedName.replace(/_/g, ' ')}" already exists in this category.`);
                        return;
                    }
                    State.saveStateToHistory();
                    parentObject[sanitizedName] = (type === 'list') ? { instruction: '', wildcards: [] } : { instruction: '' };
                    State.saveState();
                    UI.renderAll();
                }, true);
            },
            handleSearch(searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                const container = UI.elements.container;
                let wildcardHitCount = 0;

                container.querySelectorAll('.highlight').forEach(el => {
                    el.outerHTML = el.textContent;
                });
                
                if (!term) {
                    container.querySelectorAll('[data-path], [data-parent-path]').forEach(el => {
                        el.style.display = 'block';
                        if(el.tagName === 'DETAILS') el.open = false;
                    });
                    UI.elements.searchResultsCount.textContent = '';
                    return;
                }

                const matchedPaths = new Set();
                
                function findVisiblePaths(obj, currentPath) {
                    let hasMatchInChildren = false;
                    Object.keys(obj).forEach(key => {
                        const newPath = currentPath ? `${currentPath}/${key}` : key;
                        const data = obj[key];
                        const isLeaf = Array.isArray(data.wildcards);
                        let isDirectMatch = key.toLowerCase().includes(term);

                        if (isLeaf) {
                            const matchingWildcards = data.wildcards.filter(wc => wc.toLowerCase().includes(term));
                            if (matchingWildcards.length > 0) {
                                wildcardHitCount += matchingWildcards.length;
                                isDirectMatch = true;
                            }
                            if (isDirectMatch) {
                                matchedPaths.add(newPath);
                                hasMatchInChildren = true;
                            }
                        } else {
                            if (findVisiblePaths(data, newPath) || isDirectMatch) {
                                matchedPaths.add(newPath);
                                hasMatchInChildren = true;
                            }
                        }
                    });
                    return hasMatchInChildren;
                }
                
                findVisiblePaths(State.appState.wildcards, '');

                container.querySelectorAll('details, [data-path^=""], [data-parent-path]').forEach(el => {
                    const path = el.dataset.path || el.dataset.parentPath;
                    if (!path && el.tagName !== 'DETAILS') {
                         const parentDetails = el.closest('details');
                         if(parentDetails && matchedPaths.has(parentDetails.dataset.path)){
                             el.style.display = 'block';
                         } else {
                             el.style.display = 'none';
                         }
                         return;
                    }

                    const isMatch = Array.from(matchedPaths).some(p => path.startsWith(p) || p.startsWith(path));
                    
                    if (isMatch) {
                        el.style.display = 'block';
                        if (el.tagName === 'DETAILS') {
                           el.open = true;
                        }
                        if(el.dataset.path) {
                            el.querySelectorAll('.chip span').forEach(span => {
                                const originalText = span.textContent;
                                if (originalText.toLowerCase().includes(term)) {
                                    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\\]/g, '\\$&')})`, 'gi');
                                    span.innerHTML = sanitize(originalText).replace(regex, `<span class="highlight">$1</span>`);
                                }
                            });
                        }
                    } else {
                        el.style.display = 'none';
                    }
                });
                UI.elements.searchResultsCount.textContent = `${wildcardHitCount} hits`;
            },
            handleDragStart(e) {
                const target = e.target.closest('[data-path]');
                if (target) {
                    this.draggedPath = target.dataset.path;
                    e.dataTransfer.setData('text/plain', this.draggedPath);
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => target.classList.add('dragging'), 0);
                }
            },
            handleDragOver(e) {
                e.preventDefault();
                const dropZone = e.target.closest('.content-wrapper');
                if (!dropZone || !this.draggedPath) return;

                const dropPath = dropZone.parentElement.dataset.path;
                const draggedKey = this.draggedPath.split('/').pop();
                const destinationObject = this.getObjectByPath(dropPath);

                if (this.draggedPath === dropPath || dropPath.startsWith(this.draggedPath + '/') || (destinationObject && destinationObject[draggedKey])) {
                    e.dataTransfer.dropEffect = 'none';
                    dropZone.classList.remove('drag-over');
                } else {
                    e.dataTransfer.dropEffect = 'move';
                    dropZone.classList.add('drag-over');
                }
            },
            handleDragLeave(e) {
                const target = e.target.closest('.content-wrapper');
                if (target) {
                    target.classList.remove('drag-over');
                }
            },
            handleDrop(e) {
                e.preventDefault();
                e.stopPropagation();
                const dropZone = e.target.closest('.content-wrapper');
                if (!dropZone || !this.draggedPath) return;
                
                dropZone.classList.remove('drag-over');
                const dropPath = dropZone.parentElement.dataset.path;

                if (this.draggedPath === dropPath || dropPath.startsWith(this.draggedPath + '/')) {
                    return;
                }

                const draggedKey = this.draggedPath.split('/').pop();
                const draggedObject = this.getObjectByPath(this.draggedPath);
                const sourceObject = this.getParentObjectByPath(this.draggedPath);
                const destinationObject = this.getObjectByPath(dropPath);

                if (destinationObject[draggedKey]) {
                    UI.showNotification(`An item named "${draggedKey.replace(/_/g, ' ')}" already exists in the destination.`);
                    return;
                }
                
                State.saveStateToHistory();
                delete sourceObject[draggedKey];
                destinationObject[draggedKey] = draggedObject;
                State.saveState();
                UI.renderAll();
            },
            handleDragEnd(e) {
                this.draggedPath = null;
                const draggingElement = document.querySelector('.dragging');
                if (draggingElement) draggingElement.classList.remove('dragging');
            },
            handleDownloadZip() {
                const zip = new JSZip();
                const addFilesToZip = (data, path) => {
                    Object.keys(data).forEach(key => {
                        const currentData = data[key];
                        const currentPath = path ? `${path}/${key}` : key;
                        const isLeaf = Array.isArray(currentData.wildcards);

                        if (isLeaf) {
                            const fileName = currentPath.replace(/\//g, '__') + '.txt';
                            zip.file(fileName, currentData.wildcards.join('\n'));
                        } else {
                            addFilesToZip(currentData, currentPath);
                        }
                    });
                };
                addFilesToZip(State.appState.wildcards, '');
                zip.generateAsync({ type:"blob" }).then(content => { const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = "wildcard_collection.zip"; a.click(); URL.revokeObjectURL(a.href); });
            },
            buildYamlDocument(data) {
                const doc = new YAML.Document();

                function buildNode(dataObj) {
                    if (dataObj.wildcards) {
                        const seq = new YAML.YAMLSeq();
                        dataObj.wildcards.forEach(w => seq.add(new YAML.Scalar(w)));
                        return seq;
                    } else {
                        const map = new YAML.YAMLMap();
                        const keys = Object.keys(dataObj).sort().filter(k => k !== 'instruction');

                        keys.forEach(key => {
                            const valueData = dataObj[key];
                            const valueNode = buildNode(valueData);
                            
                            if (valueData.instruction) {
                                valueNode.comment = ` instruction: ${valueData.instruction}`;
                            }
                            
                            map.add({ key: new YAML.Scalar(key), value: valueNode });
                        });
                        return map;
                    }
                }

                doc.contents = buildNode(data);
                return doc;
            },

            handleExportYaml() {
                try {
                    const doc = this.buildYamlDocument(State.appState.wildcards);
                    const yamlString = doc.toString();
                    const blob = new Blob([yamlString], { type: 'text/yaml' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = "wildcards.yaml";
                    a.click();
                    URL.revokeObjectURL(a.href);
                    UI.showNotification('Wildcards exported as YAML.');
                } catch (error) {
                    UI.showNotification(`Error exporting YAML: ${error.message}`);
                    console.error(error);
                }
            },

            handleImportYaml() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.yaml,.yml';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = re => {
                        const rawText = re.target.result;
                        try {
                            const doc = YAML.parseDocument(rawText);
                            const importedData = App.processYamlNode(doc.contents);

                            UI.showNotification('Importing this file will overwrite your current collection. Are you sure?', true, () => {
                                State.appState.wildcards = importedData;
                                State.saveState();
                                State.clearHistory();
                                State.saveStateToHistory();
                                UI.renderAll();
                                UI.showNotification('YAML file imported successfully.');
                            });

                        } catch (error) {
                            if (error.linePos) {
                                const line = error.linePos.start.line;
                                const snippet = rawText.split('\n').slice(Math.max(0, line - 2), line + 3).join('\n');
                                UI.showNotification(`Error parsing YAML at line ${line + 1}:<br><b>${error.message}</b><br><br><pre class="text-left text-xs whitespace-pre-wrap custom-scrollbar" style="max-height: 200px; overflow-y: auto; background-color: var(--bg-primary); padding: 1rem;">${sanitize(snippet)}</pre>`);
                            } else {
                                UI.showNotification(`Error importing: ${error.message}`);
                            }
                            console.error(error);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            },

            handleExportConfig() {
                try {
                    const configString = JSON.stringify(Config, null, 2);
                    const blob = new Blob([configString], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = "config.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                    UI.showNotification('Configuration exported.');
                } catch (error) {
                    UI.showNotification(`Error exporting configuration: ${error.message}`);
                    console.error(error);
                }
            },

            handleImportConfig() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = re => {
                        try {
                            const newConfig = JSON.parse(re.target.result);
                            UI.showNotification('Importing this configuration will overwrite your current settings and require a reload. Are you sure?', true, () => {
                                // Assign to a temporary object to avoid modifying Config directly before saving
                                const updatedConfig = { ...Config, ...newConfig };
                                Config = updatedConfig;
                                State.saveConfig(); // Save the merged config
                                UI.showNotification('Configuration imported successfully. The page will now reload.');
                                setTimeout(() => window.location.reload(), 1500);
                            });
                        } catch (error) {
                            UI.showNotification(`Error importing configuration: ${error.message}`);
                            console.error(error);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            },

            handleHelp() { UI.showNotification(`Welcome!\n\nKey Features:\n- Global Settings: Set API keys and choose your provider.\n- Recursive Categories: Add nested categories for better organization.\n- Drag & Drop: Reorder items by dragging them into category folders.\n- Inline Renaming: Click any title to rename it.\n- Generate More: Use AI to create new wildcards for any list.\n- Suggest Categories: Use AI to get ideas for new top-level categories.\n- Export/Import: Save and load your entire setup.\n- Undo/Redo: Revert or re-apply changes.`); }
        };

        // Suggestions Popup JavaScript
        const dlg = document.getElementById('suggestPopup');
        const cancelBtn = document.getElementById('cancelBtn');
        const confirmBtn = document.getElementById('confirmBtn');
        const cards = document.querySelectorAll('.suggest-card');

        dlg.addEventListener('click', e => {
            if (e.target.matches('.api-link')) {
                e.preventDefault();
                const requestData = dlg.dataset.apiRequest;
                if (requestData) {
                    const formattedRequest = `<pre class="text-left text-xs whitespace-pre-wrap custom-scrollbar" style="max-height: 400px; overflow-y: auto; background-color: var(--bg-primary); padding: 1rem;">${sanitize(requestData)}</pre>`;
                    UI.showNotification(`<strong>API Request Details:</strong>${formattedRequest}`);
                } else {
                    UI.showNotification('No API request details available.');
                }
            }
        });

        /* close */
        cancelBtn.addEventListener('click', () => dlg.close());
        dlg.addEventListener('cancel', e => e.preventDefault()); // block Esc default so footer handles it

        /* card selection */
        function bindCardEvents() {
            const currentCards = document.querySelectorAll('.suggest-card');
            currentCards.forEach(card => {
                card.addEventListener('click', toggle);
                card.addEventListener('keydown', e => {
                    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle.call(card); }
                });
            });
        }

        function toggle() {
            const selected = this.getAttribute('aria-checked') === 'true';
            this.setAttribute('aria-checked', !selected);
        }

        /* confirm */
        confirmBtn.addEventListener('click', () => {
            const path = dlg.dataset.currentPath;
            const parentObject = App.getObjectByPath(path);
            const chosenCards = Array.from(document.querySelectorAll('.suggest-card[aria-checked="true"]'));
            if (chosenCards.length > 0) {
                State.saveStateToHistory();
                let addedCount = 0;
                chosenCards.forEach(card => {
                    const name = card.dataset.name;
                    const instruction = card.dataset.instruction;
                    const sanitizedName = name.trim().replace(/\s+/g, '_');
                    if (sanitizedName && !parentObject[sanitizedName]) {
                        parentObject[sanitizedName] = { instruction: instruction, wildcards: [] };
                        addedCount++;
                    }
                });
                if (addedCount > 0) {
                    State.saveState();
                    UI.renderAll();
                    UI.announce(`${addedCount} new items added.`);
                }
            }
            dlg.close();
        });

        // Function to bind events to cards (though now bound directly in handleSuggestItems)
        // Kept for potential future use or reference
        bindCardEvents();

        // Generate More Popup JavaScript
        const generateDlg = document.getElementById('generatePopup');
        const generateCancelBtn = document.getElementById('generateCancelBtn');
        const generateConfirmBtn = document.getElementById('generateConfirmBtn');
        const generateSelectAllBtn = document.getElementById('generate-select-all');

        generateCancelBtn.addEventListener('click', () => generateDlg.close());

        generateConfirmBtn.addEventListener('click', () => {
            const path = generateDlg.dataset.path;
            if (!path) return;

            const dataObject = App.getObjectByPath(path);
            const selectedItems = Array.from(generateDlg.querySelectorAll('.suggest-card[aria-checked="true"]'));
            
            if (selectedItems.length > 0) {
                State.saveStateToHistory();
                const wildcardsToAdd = selectedItems.map(item => item.dataset.wildcard);
                dataObject.wildcards.push(...wildcardsToAdd);
                dataObject.wildcards.sort((a, b) => a.localeCompare(b));
                State.saveState();
                UI.updateCardByPath(path);
                UI.announce(`Added ${wildcardsToAdd.length} new wildcards.`);
            }
            generateDlg.close();
        });

        generateSelectAllBtn.addEventListener('click', () => {
            const cards = generateDlg.querySelectorAll('.suggest-card');
            const allSelected = Array.from(cards).every(card => card.getAttribute('aria-checked') === 'true');
            cards.forEach(card => card.setAttribute('aria-checked', String(!allSelected)));
            generateSelectAllBtn.textContent = allSelected ? 'Select All' : 'Deselect All';
        });

        generateDlg.addEventListener('close', () => {
            generateSelectAllBtn.textContent = 'Select All';
        });

        document.addEventListener('DOMContentLoaded', App.init.bind(App));