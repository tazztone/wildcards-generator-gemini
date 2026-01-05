import { State } from './state.js';
import { sanitize } from './utils.js';
import { Config, saveConfig, saveApiKey, getEffectivePrompt, setCustomPrompt, isUsingDefault, resetToDefault } from './config.js';

export const UI = {
    elements: {},
    _settingsDirty: false, // Track if settings have been modified since dialog opened

    init() {
        this.cacheElements();
        this.renderApiSettings(); // Initial render of settings panels
        this.bindGlobalEvents();
    },

    cacheElements() {
        this.elements = {
            container: document.getElementById('wildcard-container'),
            toastContainer: document.getElementById('toast-container'),
            dialog: document.getElementById('notification-dialog'),
            dialogMessage: document.getElementById('notification-message'),
            dialogConfirmButtons: document.getElementById('confirmation-buttons'),
            dialogConfirm: document.getElementById('confirm-btn'),
            dialogCancel: document.getElementById('cancel-btn'),
            dialogClose: document.getElementById('notification-close'),
            breadcrumbs: document.getElementById('breadcrumbs-container'),
            statsBar: document.getElementById('stats-bar'),
            // Settings Modal
            settingsDialog: document.getElementById('settings-dialog'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsCloseBtn: document.getElementById('settings-close-btn'),
            // Overflow Menu
            overflowMenuBtn: document.getElementById('overflow-menu-btn'),
            overflowMenuDropdown: document.getElementById('overflow-menu-dropdown'),
            // Search
            search: document.getElementById('search-wildcards'),
            searchClearBtn: document.getElementById('search-clear-btn'),
            searchResultsCount: document.getElementById('search-results-count'),
        };

        // Search Handlers
        if (this.elements.search) {
            // Create debounced search handler
            let searchTimeout = null;
            this.elements.search.addEventListener('input', (e) => {
                const val = e.target.value;
                if (this.elements.searchClearBtn) {
                    if (val && val.length > 0) this.elements.searchClearBtn.classList.remove('hidden');
                    else this.elements.searchClearBtn.classList.add('hidden');
                }
                // Debounced search execution
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(val);
                }, 300);
            });
        }
        if (this.elements.searchClearBtn) {
            this.elements.searchClearBtn.addEventListener('click', () => {
                this.elements.search.value = '';
                this.elements.searchClearBtn.classList.add('hidden');
                this.elements.search.focus();
                // Trigger input event to update search results (handled in main.js/app.js)
                this.elements.search.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }

        // Settings Modal Handlers
        this.elements.settingsBtn?.addEventListener('click', () => {
            this._settingsDirty = false; // Reset dirty state on open
            this.elements.settingsDialog?.showModal();
        });

        // Helper to request closing settings with confirmation if dirty
        const requestCloseSettings = () => {
            if (this._settingsDirty) {
                this.showNotification('You have unsaved changes.', true, null, false, [
                    {
                        text: 'Save & Close',
                        class: 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded',
                        onClick: () => {
                            this.saveAllSettings();
                            this._settingsDirty = false;
                            this.elements.settingsDialog?.close();
                            this.elements.dialog.close();
                        }
                    },
                    {
                        text: 'Discard Changes',
                        class: 'bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded',
                        onClick: () => {
                            this._settingsDirty = false;
                            this.elements.settingsDialog?.close();
                            this.elements.dialog.close();
                        }
                    },
                    {
                        text: 'Cancel',
                        class: 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded',
                        onClick: () => {
                            this.elements.dialog.close();
                        }
                    }
                ]);
            } else {
                this.elements.settingsDialog?.close();
            }
        };

        this.elements.settingsCloseBtn?.addEventListener('click', requestCloseSettings);

        this.elements.settingsDialog?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsDialog) {
                requestCloseSettings();
            }
        });

        // Handle Escape key - prevent default close behavior if dirty
        this.elements.settingsDialog?.addEventListener('cancel', (e) => {
            if (this._settingsDirty) {
                e.preventDefault();
                requestCloseSettings();
            }
        });

        // Track changes in settings inputs to mark as dirty
        this.elements.settingsDialog?.addEventListener('input', (e) => {
            if (e.target.matches('input, textarea, select')) {
                this._settingsDirty = true;
            }
        });

        // Overflow Menu Handlers
        if (this.elements.overflowMenuBtn && this.elements.overflowMenuDropdown) {
            this.elements.overflowMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.elements.overflowMenuDropdown.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!this.elements.overflowMenuBtn.contains(e.target) && !this.elements.overflowMenuDropdown.contains(e.target)) {
                    this.elements.overflowMenuDropdown.classList.add('hidden');
                }
            });
            this.elements.overflowMenuDropdown.addEventListener('click', () => {
                this.elements.overflowMenuDropdown.classList.add('hidden');
            });
        }
    },

    bindGlobalEvents() {
        State.events.addEventListener('state-updated', (e) => this.handleStateUpdate(e));
        State.events.addEventListener('state-reset', () => this.renderAll());
        State.events.addEventListener('state-patch', (e) => this.handleStatePatch(/** @type {CustomEvent} */(e).detail));
        State.events.addEventListener('notification', (e) => this.showNotification(/** @type {CustomEvent} */(e).detail));

        // Listen for new custom events for focus/navigation
        document.addEventListener('request-focus-path', (e) => this.focusPath(/** @type {CustomEvent} */(e).detail.path));

        // Prompt change handlers - save custom prompts via config
        document.getElementById('global-prompt')?.addEventListener('input', (e) => {
            setCustomPrompt('system', /** @type {HTMLTextAreaElement} */(e.target).value);
            this.updatePromptStatusBadge('global-prompt', 'CUSTOM_SYSTEM_PROMPT');
        });
        document.getElementById('suggestion-prompt')?.addEventListener('input', (e) => {
            setCustomPrompt('suggest', /** @type {HTMLTextAreaElement} */(e.target).value);
            this.updatePromptStatusBadge('suggestion-prompt', 'CUSTOM_SUGGEST_PROMPT');
        });

        // API endpoint change handler - persist selection
        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = /** @type {HTMLSelectElement} */ (e.target).value;
            Config.API_ENDPOINT = provider;
            saveConfig(); // Persist provider selection
            this.updateSettingsVisibility(provider);
        });
    },

    sortKeys(keys, parentPath) {
        const pinned = State.state.pinnedCategories || [];
        return keys.sort((a, b) => {
            const pathA = parentPath ? `${parentPath}/${a}` : a;
            const pathB = parentPath ? `${parentPath}/${b}` : b;
            const isPinnedA = pinned.includes(pathA);
            const isPinnedB = pinned.includes(pathB);

            if (isPinnedA && !isPinnedB) return -1;
            if (!isPinnedA && isPinnedB) return 1;
            return String(a).localeCompare(String(b));
        });
    },

    renderAll() {
        const wildcards = State.state.wildcards;

        // Populate prompts from State
        /** @type {HTMLTextAreaElement|null} */
        // @ts-ignore
        const globalPrompt = document.getElementById('global-prompt');
        /** @type {HTMLTextAreaElement|null} */
        // @ts-ignore
        const suggestionPrompt = document.getElementById('suggestion-prompt');
        /** @type {HTMLSelectElement|null} */
        // @ts-ignore
        const apiEndpoint = document.getElementById('api-endpoint');

        if (globalPrompt) {
            globalPrompt.value = getEffectivePrompt('system');
            this.updatePromptStatusBadge('global-prompt', 'CUSTOM_SYSTEM_PROMPT');
        }
        if (suggestionPrompt) {
            suggestionPrompt.value = getEffectivePrompt('suggest');
            this.updatePromptStatusBadge('suggestion-prompt', 'CUSTOM_SUGGEST_PROMPT');
        }
        if (apiEndpoint) {
            apiEndpoint.value = Config.API_ENDPOINT || 'openrouter';
            this.updateSettingsVisibility(apiEndpoint.value);
        }

        // Efficient full render
        this.elements.container.innerHTML = '';

        const fragment = document.createDocumentFragment();

        // Sort keys
        let keys = Object.keys(wildcards);
        keys = this.sortKeys(keys, '');

        keys.forEach((key, index) => {
            const data = wildcards[key];
            const el = this.createCategoryElement(key, data, 0, key, index);
            fragment.appendChild(el);
        });

        fragment.appendChild(this.createPlaceholderCategory());
        this.elements.container.appendChild(fragment);

        this.updateStats();
    },

    handleStateUpdate(e) {
        const { path, value, type } = e.detail;

        // path is Array e.g. ['wildcards', 'Characters'] or ['wildcards', 'Characters', 'wildcards', '0']

        if (path[0] === 'pinnedCategories') {
            this.renderAll();
            return;
        }

        if (path[0] !== 'wildcards') {
            // Handle global settings changes if needed
            return;
        }

        // Fix for UI Refresh issue on Import/Reset
        // If the path is exactly ['wildcards'] or just has length 1 but we can't determine specific op,
        // and especially if it's a 'set' operation on the root, we must re-render all.
        if (path.length === 1 && path[0] === 'wildcards') {
            this.renderAll();
            return;
        }

        const wildcardsPath = path.slice(1); // Remove 'wildcards' prefix

        // CASE 0: Root wildcards object replaced (Import/Reset)
        if (wildcardsPath.length === 0) {
            this.renderAll();
            return;
        }

        const relevantKey = wildcardsPath[0];
        const stringPath = wildcardsPath.join('/');

        // CASE 1: Top-level category added/removed
        if (wildcardsPath.length === 1) {
            const key = wildcardsPath[0];
            const fullPath = key; // Top level

            if (type === 'delete' || value === undefined) {
                const el = this.elements.container.querySelector(`details[data-path="${fullPath}"]`);
                if (el) el.remove();
            } else {
                // Addition or full replace
                // Check if exists
                const existing = this.elements.container.querySelector(`details[data-path="${fullPath}"]`);

                // Calculate index for tinting
                const allKeys = Object.keys(State.state.wildcards || {}).sort((a, b) => a.localeCompare(b));
                const index = allKeys.indexOf(key);

                if (existing) {
                    // Replace content? Or just update? For now, re-render category is safest for full object replacement
                    const newEl = this.createCategoryElement(key, value, 0, fullPath, index);
                    // Preserve state (open/closed)
                    if (existing.hasAttribute('open')) {
                        newEl.setAttribute('open', '');
                    }
                    existing.replaceWith(newEl);
                } else {
                    // Add new
                    const newEl = this.createCategoryElement(key, value, 0, fullPath, index);
                    // Need to insert in correct sort order... for now append
                    // To do it right: find first sibling that should come AFTER this one and insertBefore
                    let inserted = false;
                    const children = this.elements.container.children;
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child.classList.contains('category-item')) {
                            const childPath = child.dataset.path;
                            // Check if childPath > fullPath
                            if (childPath.localeCompare(fullPath) > 0) {
                                this.elements.container.insertBefore(newEl, child);
                                inserted = true;
                                break;
                            }
                        }
                    }

                    if (!inserted) {
                        this.elements.container.insertBefore(newEl, this.elements.container.querySelector('.placeholder-category'));
                    }
                }
            }
            this.updateStats();
            return;
        }

        // CASE 2: Nested update
        // Find the closest rendered parent (Category or Wildcard List)
        // Since we are doing targeted updates, we need to identify WHAT changed.

        const parentPath = wildcardsPath.slice(0, -1).join('/'); // Path up to the changed property
        const changedProp = wildcardsPath[wildcardsPath.length - 1]; // e.g. 'instruction', 'wildcards', or index '0'

        // If changed property is 'wildcards' array (full replace) or index inside it
        if (wildcardsPath.includes('wildcards')) {
            // It's inside a leaf node (wildcard list)
            // Find the card element
            // The path to the card is the path UP TO the key containing 'wildcards'
            // e.g. wildcards.Characters.wildcards -> path is 'Characters'
            // e.g. wildcards.Characters.Sub.wildcards -> path is 'Characters/Sub'

            let cardPathArr = [];
            for (let i = 0; i < wildcardsPath.length; i++) {
                if (wildcardsPath[i] === 'wildcards') break;
                cardPathArr.push(wildcardsPath[i]);
            }
            const cardPath = cardPathArr.join('/');

            const cardEl = this.findCardElement(cardPath);
            if (cardEl) {
                // Determine if we update single chip or full list
                // If path ends in index number, it's a specific item update
                // If path ends in 'wildcards' or 'length', it's a structure change

                // For simplicity in V1 refactor: Re-render the chips container only
                const data = State.getObjectByPath(cardPath);
                this.updateCardContent(cardEl, data, cardPath);
            }
            this.updateStats();
            return;
        }

        // Check if a subcategory was added/removed/renamed
        // If parentPath points to a valid category in DOM, re-render its content
        // But wait, if we renamed 'Mid' in 'Top/Mid', parentPath is 'Top'.
        // 'Top' should be re-rendered.
        const parentEl = this.findElement(parentPath);
        if (parentEl && parentEl.tagName === 'DETAILS') {
            const data = State.getObjectByPath(parentPath);
            if (data) {
                // Determine level
                const level = parseInt(parentEl.classList.value.match(/level-(\d+)/)?.[1] || '0');
                this.renderCategoryContent(parentEl, data, parentPath, level);
                this.updateStats();
                return;
            }
        }

        // CASE 3: Instruction update
        if (changedProp === 'instruction') {
            const targetPath = parentPath;
            const el = this.findElement(targetPath);
            if (el) {
                const input = el.querySelector('.custom-instructions-input');
                // @ts-ignore
                if (input && input.value !== value) input.value = value || '';
            }
        }

        this.updateStats();
    },

    /**
     * Handle batch of state changes from undo/redo operations.
     * Applies granular updates instead of full re-render.
     * @param {Array<{path: string[], type: string, value: any}>} changes
     */
    handleStatePatch(changes) {
        console.log('[UI] State patch received:', changes.length, 'changes');

        // Track paths that need stats update
        let needsStatsUpdate = false;

        for (const change of changes) {
            const { path, type, value } = change;

            // Skip non-wildcard changes or handle them specially
            if (path[0] === 'systemPrompt') {
                const globalPrompt = document.getElementById('global-prompt');
                // @ts-ignore
                if (globalPrompt) globalPrompt.value = value || '';
                continue;
            }

            if (path[0] === 'suggestItemPrompt') {
                const suggestionPrompt = document.getElementById('suggestion-prompt');
                // @ts-ignore
                if (suggestionPrompt) suggestionPrompt.value = value || '';
                continue;
            }

            if (path[0] === 'pinnedCategories') {
                // Full re-render needed for pinned changes
                this.renderAll();
                return;
            }

            // Delegate to handleStateUpdate for wildcards changes
            if (path[0] === 'wildcards') {
                needsStatsUpdate = true;
                // Create a synthetic event detail to reuse handleStateUpdate logic
                this.handleStateUpdate({
                    detail: { path, value, type }
                });
            }
        }

        if (needsStatsUpdate) {
            this.updateStats();
        }
    },

    findElement(path) {
        return document.querySelector(`[data-path="${path}"]`);
    },

    renderApiSettings() {
        const container = document.getElementById('api-settings-container');
        const template = document.getElementById('api-settings-template');
        if (!container || !template) return;

        const providers = [
            {
                id: 'openrouter',
                title: 'OpenRouter API',
                iconUrl: 'https://openrouter.ai/favicon.ico',
                linkUrl: 'https://openrouter.ai/keys',
                apiKeyId: 'openrouter-api-key',
                apiKeyPlaceholder: 'sk-or-...',
                modelNameId: 'openrouter-model-name',
                modelListId: 'openrouter-model-list',
                modelPlaceholder: 'e.g., openai/gpt-4o',
                loadingId: 'openrouter-model-loading-indicator',
                errorId: 'openrouter-model-error-indicator',
                showKeyHelp: true,
                showTip: true,
                tipText: 'OpenRouter provides access to hundreds of models (Chat-GPT, Claude, Gemini, Deepseek, GLM, etc) many of them for free.',
                extraOptions: true
            },
            {
                id: 'gemini',
                title: 'Gemini API',
                linkUrl: 'https://aistudio.google.com/app/apikey',
                apiKeyId: 'gemini-api-key',
                apiKeyPlaceholder: 'AIzaSy...',
                modelNameId: 'gemini-model-name',
                modelListId: 'gemini-model-list',
                modelPlaceholder: 'e.g., gemini-1.5-flash',
                loadingId: 'gemini-model-loading-indicator',
                errorId: 'gemini-model-error-indicator',
                showKeyHelp: false
            },
            {
                id: 'custom',
                title: 'Custom API',
                isCustom: true,
                apiKeyId: 'custom-api-key',
                apiKeyPlaceholder: 'Enter API key if required',
                apiKeyOptional: true,
                modelNameId: 'custom-model-name',
                modelListId: 'custom-model-list',
                modelPlaceholder: 'Enter model identifier',
                apiUrlId: 'custom-api-url',
                loadingId: 'custom-model-loading-indicator',
                errorId: 'custom-model-error-indicator'
            }
        ];

        container.innerHTML = '';

        providers.forEach(p => {
            // @ts-ignore
            const clone = template.content.cloneNode(true);
            const panel = clone.querySelector('.api-settings-panel');
            panel.id = `settings-${p.id}`;

            // Header
            const titleEl = clone.querySelector('.provider-title');
            if (p.iconUrl) {
                const img = document.createElement('img');
                img.src = p.iconUrl;
                img.className = 'w-5 h-5 opacity-80';
                titleEl.appendChild(img);
                titleEl.appendChild(document.createTextNode(' ' + p.title));
            } else {
                titleEl.textContent = p.title;
            }

            const headerLink = clone.querySelector('.header-section a');
            if (p.linkUrl) {
                headerLink.href = p.linkUrl;
            } else {
                headerLink.remove();
            }

            if (p.isCustom) {
                clone.querySelector('.custom-badge').classList.remove('hidden');
                const urlSection = clone.querySelector('.custom-url-section');
                urlSection.classList.remove('hidden');
                urlSection.querySelector('input').id = p.apiUrlId;
                // Populate Custom URL
                if (Config[p.apiUrlId] || Config.API_URL_CUSTOM) {
                    urlSection.querySelector('input').value = Config[p.apiUrlId] || Config.API_URL_CUSTOM;
                }
            }

            // API Key
            const apiKeyInput = clone.querySelector('.api-key-input');
            apiKeyInput.id = p.apiKeyId;
            apiKeyInput.placeholder = p.apiKeyPlaceholder;

            // POPULATE KEY FROM CONFIG
            const configKey = `API_KEY_${p.id.toUpperCase()}`;
            if (Config[configKey]) {
                apiKeyInput.value = Config[configKey];
            }

            // Associate label with API key input
            const apiKeyLabel = apiKeyInput.closest('div').previousElementSibling;
            if (apiKeyLabel && apiKeyLabel.tagName === 'LABEL') {
                apiKeyLabel.htmlFor = p.apiKeyId;
            }

            // Toggle visibility button ARIA
            const toggleBtn = clone.querySelector('.toggle-visibility-btn');
            if (toggleBtn) {
                toggleBtn.setAttribute('aria-label', 'Show API Key');
                toggleBtn.setAttribute('aria-pressed', 'false');

                // Toggle Visibility Logic
                toggleBtn.addEventListener('click', () => {
                    const isVisible = apiKeyInput.type === 'text';
                    apiKeyInput.type = isVisible ? 'password' : 'text';
                    toggleBtn.setAttribute('aria-label', isVisible ? 'Show API Key' : 'Hide API Key');
                    toggleBtn.setAttribute('aria-pressed', (!isVisible).toString());
                    toggleBtn.querySelector('.eye-icon .eye-slash').classList.toggle('hidden', isVisible);
                    toggleBtn.querySelector('.eye-icon path:not(.eye-slash)').classList.toggle('hidden', !isVisible);
                });
            }

            // Copy API Key Button (UX Improvement)
            const copyKeyBtn = document.createElement('button');
            copyKeyBtn.className = 'input-icon-btn right-8 mr-1 text-gray-500 hover:text-white transition-colors';
            copyKeyBtn.title = 'Copy API Key';
            copyKeyBtn.setAttribute('aria-label', 'Copy API Key to clipboard');
            copyKeyBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
            `;

            // Adjust input padding to accommodate both buttons
            apiKeyInput.classList.remove('pr-10');
            apiKeyInput.classList.add('pr-20');

            // Insert copy button before toggle button
            if (toggleBtn) {
                toggleBtn.parentNode.insertBefore(copyKeyBtn, toggleBtn);
            }

            copyKeyBtn.addEventListener('click', async () => {
                if (apiKeyInput.value) {
                    try {
                        await navigator.clipboard.writeText(apiKeyInput.value);
                        UI.showToast('API Key copied to clipboard', 'success');
                    } catch (err) {
                        UI.showToast('Failed to copy', 'error');
                    }
                } else {
                    UI.showToast('No API Key to copy', 'info');
                }
            });

            if (p.apiKeyOptional) {
                clone.querySelector('.optional-text').classList.remove('hidden');
            }

            if (p.showKeyHelp) {
                clone.querySelector('.key-help-text').classList.remove('hidden');
            }

            // Check Persistence state
            const rememberCheckbox = clone.querySelector('.api-key-remember');
            if (localStorage.getItem(`wildcards_api_key_${p.id}`)) {
                rememberCheckbox.checked = true;
            }

            // Bind API Key Saving
            const handleSaveKey = () => {
                const key = apiKeyInput.value.trim();
                const persist = rememberCheckbox.checked;
                saveApiKey(p.id, key, persist);
            };

            apiKeyInput.addEventListener('input', handleSaveKey);
            apiKeyInput.addEventListener('change', handleSaveKey);
            rememberCheckbox.addEventListener('change', handleSaveKey);

            // Model Name Input Wrapper
            const modelInputWrapper = document.createElement('div');
            modelInputWrapper.className = 'relative w-full';

            const modelInput = clone.querySelector('.model-name-input');
            modelInput.id = p.modelNameId;
            modelInput.setAttribute('list', p.modelListId);
            modelInput.placeholder = p.modelPlaceholder;
            modelInput.classList.add('pr-8'); // Space for X button

            // Clear Button
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'model-clear-btn absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white hidden';
            clearBtn.innerHTML = '✕';
            clearBtn.ariaLabel = 'Clear model name';

            // Logic for clear button
            const updateClearBtn = () => {
                if (modelInput.value) clearBtn.classList.remove('hidden');
                else clearBtn.classList.add('hidden');
            };

            modelInput.addEventListener('input', updateClearBtn);

            // AUTO-SAVE MODEL NAME
            const configModelKey = `MODEL_NAME_${p.id.toUpperCase()}`;
            if (Config[configModelKey]) {
                modelInput.value = Config[configModelKey];
            }

            const saveModelName = () => {
                Config[configModelKey] = modelInput.value;
                saveConfig();
            };

            modelInput.addEventListener('input', saveModelName);
            modelInput.addEventListener('change', saveModelName);

            // Initial check
            setTimeout(updateClearBtn, 100);

            clearBtn.addEventListener('click', () => {
                modelInput.value = '';
                updateClearBtn();
                modelInput.focus();
                modelInput.dispatchEvent(new Event('change', { bubbles: true })); // Notify app
            });

            // Move input into wrapper and insert wrapper
            modelInput.parentNode.insertBefore(modelInputWrapper, modelInput);
            modelInputWrapper.appendChild(modelInput);
            modelInputWrapper.appendChild(clearBtn);

            // Associate label with Model Name input
            // (Parent node changed)
            const wrapperContainer = modelInputWrapper.parentNode;
            const modelLabel = wrapperContainer.previousSibling;
            // @ts-ignore
            if (modelLabel && modelLabel.tagName === 'LABEL') {
                // @ts-ignore
                modelLabel.htmlFor = p.modelNameId;
            }

            // Extra Options (Filters & Refresh)
            if (p.extraOptions) {
                // Refresh Button
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-models-btn p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors ml-1';
                refreshBtn.innerHTML = '<span aria-hidden="true">🔄</span>';
                refreshBtn.setAttribute('aria-label', 'Refresh Model List');
                refreshBtn.title = 'Refresh Model List';
                refreshBtn.dataset.provider = p.id;

                // Append refresh button AFTER the wrapper (sibling to wrapper)
                // Use a flex container for wrapper + refresh btn?
                // The current layout seems to expect input to be direct child of a flex/grid cell?
                // Let's ensure structure.

                const containerDiv = document.createElement('div');
                containerDiv.className = 'flex items-center w-full';
                modelInputWrapper.parentNode.replaceChild(containerDiv, modelInputWrapper);
                containerDiv.appendChild(modelInputWrapper);
                containerDiv.appendChild(refreshBtn);

                // Checkboxes Container
                const filtersDiv = document.createElement('div');
                filtersDiv.className = 'flex flex-wrap gap-4 mt-2 text-sm text-gray-300';

                // ... checkboxes ...
                // Free Only
                const freeLabel = document.createElement('label');
                freeLabel.className = 'flex items-center gap-2 cursor-pointer';
                freeLabel.innerHTML = `<input type="checkbox" id="${p.id}-free-only" class="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500"> <span>Free Models Only</span>`;

                // JSON Support
                const jsonLabel = document.createElement('label');
                jsonLabel.className = 'flex items-center gap-2 cursor-pointer';
                jsonLabel.innerHTML = `<input type="checkbox" id="${p.id}-json-only" class="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500" checked> <span>Require JSON Support</span>`;

                filtersDiv.appendChild(freeLabel);
                filtersDiv.appendChild(jsonLabel);

                // Insert filters after the container
                containerDiv.parentNode.insertBefore(filtersDiv, containerDiv.nextSibling);

                // Re-bind refresh click manually or delegate? 
                // Currently handled? ui.js doesn't seem to bind refresh click in bindGlobalEvents for these dynamic ones?
                // Ah, bindGlobalEvents might need to delegate.
                // Or I bind it here.
                refreshBtn.addEventListener('click', (e) => {
                    // Trigger refresh logic
                    // For now, let's trigger the testConnection logic again to refresh list
                    /** @type {HTMLButtonElement} */
                    const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
                    btn.classList.add('animate-spin');
                    // Note: Api is imported in app.js and exposed globally
                    // @ts-ignore
                    window.Api?.testConnection(p.id, null, Config[`API_KEY_${p.id.toUpperCase()}`]).then(models => {
                        this.populateModelList(p.id, models);
                        btn.classList.remove('animate-spin');
                    }).catch(() => btn.classList.remove('animate-spin'));
                });
            }

            const datalist = clone.querySelector('.model-list');
            datalist.id = p.modelListId;

            const testBtn = clone.querySelector('.test-conn-btn');
            testBtn.dataset.provider = p.id;

            const testModelBtn = clone.querySelector('.test-model-btn');
            if (testModelBtn) testModelBtn.dataset.provider = p.id;

            const loadingInd = clone.querySelector('.loading-indicator');
            loadingInd.id = p.loadingId || `loading-${p.id}`;

            const errorInd = clone.querySelector('.error-indicator');
            errorInd.id = p.errorId || `error-${p.id}`;

            // Tip
            if (p.showTip) {
                const tipBox = clone.querySelector('.tip-box');
                tipBox.classList.remove('hidden');
                tipBox.querySelector('.tip-text').textContent = p.tipText;
            }

            // Advanced Model Settings Binding
            const settingsInputs = clone.querySelectorAll('[data-setting]');
            settingsInputs.forEach(input => {
                const settingKey = input.dataset.setting;
                const displayEl = clone.querySelector(`[data-for="setting-${settingKey.replace('MODEL_', '').toLowerCase().replace(/_/g, '-')}"]`);

                // Set initial value
                if (Config[settingKey] !== undefined) {
                    input.value = Config[settingKey];
                    // Update display if exists
                    if (displayEl) displayEl.textContent = Config[settingKey];
                }

                // Bind Event
                input.addEventListener('input', (e) => {
                    const val = (input.type === 'number' || input.type === 'range') ? parseFloat(e.target.value) : e.target.value;
                    Config[settingKey] = val;
                    saveConfig();

                    if (displayEl) displayEl.textContent = val;
                });
            });

            container.appendChild(clone);
        });

        // Restore active selection from Config
        const active = Config.API_ENDPOINT || 'openrouter';
        this.updateSettingsVisibility(active);
    },

    updateSettingsVisibility(provider) {
        document.querySelectorAll('.api-settings-panel').forEach(el => el.classList.add('hidden'));
        const selectedPanel = document.getElementById(`settings-${provider}`);
        if (selectedPanel) {
            selectedPanel.classList.remove('hidden');
        }
    },

    handleSearch(query) {
        const normalizedQuery = query.toLowerCase().trim();
        let matchCount = 0;

        console.error(`[Search Debug] Query: "${normalizedQuery}"`);

        const scan = (el) => {
            let hasMatch = false;

            // Check if this element matches
            // It could be a category (details) or a wildcard card (div)
            const path = el.dataset.path;
            const nameEl = el.querySelector('.category-name, .wildcard-name');
            const name = nameEl ? nameEl.textContent.toLowerCase() : '';

            // Check wildcards inside if it's a card
            let wildcardsMatch = false;
            if (el.classList.contains('wildcard-card')) {
                const chips = el.querySelectorAll('.chip span[contenteditable]');
                chips.forEach(chip => {
                    if (chip.textContent.toLowerCase().includes(normalizedQuery)) wildcardsMatch = true;
                });
            }

            // Check if logic matches
            if (normalizedQuery === '' || name.includes(normalizedQuery) || wildcardsMatch) {
                hasMatch = true;
                matchCount++;
            }

            // Recursive check for children categories
            // If I am a category, check my children. If any child matches, I must match (be visible)
            // But if I match myself, my children might not, but I am visible.

            // Actually, usually:
            // If query is empty -> Show all.
            // If query:
            //   Show item if:
            //     1. Name matches
            //     2. Contains matching wildcards
            //     3. Contains matching children

            if (el.tagName === 'DETAILS') {
                const children = el.querySelectorAll(':scope > .content-wrapper > .category-item, :scope > .content-wrapper > .grid > .wildcard-card');
                let childMatched = false;
                children.forEach(child => {
                    if (scan(child)) childMatched = true;
                });

                if (childMatched) {
                    hasMatch = true;
                    el.open = true; // Auto expand to show result
                }
            }

            if (hasMatch || normalizedQuery === '') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }

            return hasMatch;
        };

        const topLevel = this.elements.container.querySelectorAll(':scope > .category-item');
        topLevel.forEach(el => scan(el));

        if (this.elements.searchResultsCount) {
            this.elements.searchResultsCount.textContent = normalizedQuery ? `${matchCount} matches` : '';
        }
    },

    findCardElement(path) {
        // Can be a details (if it's a category) or a div (if it's a wildcard list)
        // Actually wildcard lists are div.bg-gray-700
        return document.querySelector(`div[data-path="${path}"]`);
    },

    toggleLoader(path, isLoading, streamText = null) {
        const card = this.findCardElement(path);
        if (!card) return;

        // Find the generate button specifically
        /** @type {HTMLButtonElement|null} */
        const btn = card.querySelector('.generate-btn');
        if (!btn) return;

        const loader = btn.querySelector('.loader');
        const text = btn.querySelector('.btn-text');

        if (isLoading) {
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-not-allowed');
            if (loader) loader.classList.remove('hidden');
            if (text) {
                text.classList.remove('hidden');
                // Start timer display
                const startTime = Date.now();
                text.textContent = '0.0s...';
                // @ts-ignore
                btn._timerInterval = setInterval(() => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    if (streamText) {
                        // Show streaming text preview (truncated)
                        const preview = streamText.length > 20 ? streamText.slice(-20) + '...' : streamText;
                        text.textContent = `${elapsed}s | ${preview}`;
                    } else {
                        text.textContent = `${elapsed}s...`;
                    }
                }, 100);
            }
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
            if (loader) loader.classList.add('hidden');
            if (text) {
                text.classList.remove('hidden');
                text.textContent = 'Generate More';
            }
            // Clear timer
            // @ts-ignore
            if (btn._timerInterval) {
                // @ts-ignore
                clearInterval(btn._timerInterval);
                // @ts-ignore
                btn._timerInterval = null;
            }
        }
    },

    // Focus Mode / Breadcrumbs
    focusPath(path) {
        if (!path) {
            this.elements.breadcrumbs.classList.add('hidden');
            this.elements.container.classList.remove('focus-mode');
            // Show all top level
            this.elements.container.querySelectorAll('.category-item').forEach(el => el.classList.remove('hidden'));
            return;
        }

        // Hide all top level items not in path
        const rootKey = path.split('/')[0];
        this.elements.container.querySelectorAll('.category-item.level-0').forEach(el => {
            if (el.dataset.path !== rootKey) el.classList.add('hidden');
            else el.classList.remove('hidden');
        });

        this.renderBreadcrumbs(path);
        this.elements.breadcrumbs.classList.remove('hidden');

        // Expand all details along the path
        const parts = path.split('/');
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += (index > 0 ? '/' : '') + part;
            // Search within container to avoid finding breadcrumb spans
            const el = this.elements.container.querySelector(`[data-path="${currentPath}"]`);
            if (el && el.tagName === 'DETAILS') {
                el.open = true;
            }
        });

        // Scroll to the target element
        const targetEl = this.elements.container.querySelector(`[data-path="${path}"]`);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    renderBreadcrumbs(path) {
        if (!this.elements.breadcrumbs) return;

        const parts = path.split('/');
        let currentPath = '';
        let html = `<span class="breadcrumb-item font-semibold" data-path="">Home</span>`;

        parts.forEach((part, index) => {
            currentPath += (index > 0 ? '/' : '') + part;
            // Clean name
            const name = part.replace(/_/g, ' ');
            html += `<span class="breadcrumb-separator">/</span>`;
            if (index === parts.length - 1) {
                html += `<span class="breadcrumb-item text-indigo-400 font-bold" data-path="${currentPath}">${sanitize(name)}</span>`;
            } else {
                html += `<span class="breadcrumb-item" data-path="${currentPath}">${sanitize(name)}</span>`;
            }
        });

        this.elements.breadcrumbs.innerHTML = html;

        // Bind clicks just for this render
        this.elements.breadcrumbs.querySelectorAll('.breadcrumb-item').forEach(el => {
            el.onclick = () => {
                const targetPath = el.dataset.path;
                const event = new CustomEvent('request-focus-path', { detail: { path: targetPath } });
                document.dispatchEvent(event);
            };
        });
    },

    // Creation Methods (Copied & Adapted from wildcards.js)

    createCategoryElement(name, data, level, path, index = 0) {
        const element = document.createElement('details');
        element.className = `card-folder rounded-lg shadow-md group level-${level} category-item`; // added category-item
        if (level === 0) {
            element.classList.add(`category-tint-${(index % 10) + 1}`);
        }
        element.dataset.path = path;
        element.draggable = true;

        element.innerHTML = this.getCategoryFolderHtml(name, data, path);
        const contentWrapper = element.querySelector('.content-wrapper');

        // Render children
        this.renderCategoryContent(element, data, path, level);

        return element;
    },

    renderCategoryContent(element, data, path, level) {
        const contentWrapper = element.querySelector('.content-wrapper');
        contentWrapper.innerHTML = '';

        let keys = Object.keys(data).filter(k => k !== 'instruction');
        const sortedKeys = this.sortKeys(keys, path);

        const leafNodes = [];
        const nonLeafNodes = [];

        for (const key of sortedKeys) {
            const childData = data[key];
            const childIsLeaf = childData && typeof childData === 'object' && Array.isArray(childData.wildcards);
            const childPath = `${path}/${key}`;

            if (childIsLeaf) {
                leafNodes.push(this.createWildcardCardElement(key, childData, level + 1, childPath));
            } else if (typeof childData === 'object' && childData !== null) {
                nonLeafNodes.push(this.createCategoryElement(key, childData, level + 1, childPath));
            }
        }

        nonLeafNodes.forEach(node => contentWrapper.appendChild(node));

        // Visual Separator for DnD
        const separator = document.createElement('div');
        separator.className = 'dnd-separator';
        separator.dataset.path = path; // The category path
        contentWrapper.appendChild(separator);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full';
        leafNodes.forEach(node => gridWrapper.appendChild(node));

        // Placeholders
        gridWrapper.appendChild(this.createWildcardPlaceholder(path));

        contentWrapper.appendChild(this.createSubcategoryPlaceholder(path));
        contentWrapper.appendChild(gridWrapper);
    },

    createWildcardCardElement(name, data, level, path) {
        const element = document.createElement('div');
        element.className = `card-wildcard p-4 rounded-lg flex flex-col level-${level} wildcard-card`; // added wildcard-card
        element.dataset.path = path;
        element.draggable = true;
        element.innerHTML = this.getWildcardCardHtml(name, data, path);
        return element;
    },

    updateCardContent(element, data, path) {
        // Targeted update for a card's internals (text, counts, chips) without replacing the element (which kills focus/drag)
        const countSpan = element.querySelector('.wildcard-count');
        if (countSpan) countSpan.textContent = `(${(data.wildcards || []).length})`;

        const chipContainer = element.querySelector('.chip-container');
        if (chipContainer) {
            // Re-render chips. Diffing individual chips is Overkill for V1, but better than full page re-render.
            const wildcards = data.wildcards || [];
            chipContainer.innerHTML = wildcards.length > 0
                ? wildcards.map((wc, i) => this.createChip(wc, i)).join('')
                : this.getEmptyListHtml();
        }
    },

    getEmptyListHtml() {
        return `
            <div class="empty-state w-full flex flex-col items-center justify-center text-gray-500 italic py-2 select-none">
                <span class="text-lg opacity-50" aria-hidden="true">📝</span>
                <span class="text-xs mt-1">No items yet. Add one or Generate.</span>
            </div>
        `;
    },

    getCategoryFolderHtml(name, data, path) {
        const isPinned = State.state.pinnedCategories && State.state.pinnedCategories.includes(path); // Use State.state
        return `
            <summary class="flex justify-between items-center p-4 cursor-pointer gap-4 group">
                <div class="flex items-center gap-3 flex-wrap flex-grow">
                    <input type="checkbox" aria-label="Select category ${sanitize(name.replace(/_/g, ' '))}" class="category-batch-checkbox w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500" onclick="event.stopPropagation();">
                    <h2 class="text-xl font-semibold text-accent select-none editable-wrapper"><span class="editable-name category-name outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit category name">${name.replace(/_/g, ' ')}</span><span class="edit-icon" title="Double-click to edit">✏️</span></h2>
                    <div class="editable-wrapper flex-grow items-center">
                    <input type="text" readonly aria-label="Folder instructions" class="editable-input custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 w-full transition-all duration-200" placeholder="Folder instructions..." style="min-width: 200px;" value="${sanitize(data.instruction || '')}">
                    <span class="edit-icon" title="Double-click to edit">✏️</span>
                </div>
                </div>
                <div class="flex items-center gap-2 ml-auto flex-shrink-0">
                    <button class="pin-btn btn-action-icon text-yellow-400 hover:text-yellow-300 text-lg transition-all duration-200" title="${isPinned ? 'Unpin' : 'Pin to top'}" aria-label="${isPinned ? 'Unpin category' : 'Pin category'}">${isPinned ? '📌' : '📍'}</button>
                    <button class="delete-btn btn-action-icon text-red-400 hover:text-red-300 transition-all duration-200 p-1 rounded hover:bg-red-400/10" title="Delete this category" aria-label="Delete this category">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                    <span class="arrow-down transition-transform duration-300 text-accent"><svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                </div>
            </summary>
            <div class="content-wrapper p-4 border-t border-gray-700 flex flex-col gap-4"></div>
        `;
    },

    getWildcardCardHtml(name, data, path) {
        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')).replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top Level';
        return `
            <button class="delete-btn btn-action-icon absolute top-2 right-2 text-red-400 hover:text-red-300 transition-all duration-200 p-1 rounded hover:bg-red-400/10 z-10" title="Delete this card" aria-label="Delete this card">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
            <div class="text-xs text-gray-400 mb-1 uppercase tracking-wider">${sanitize(parentPath)}</div>
            <div class="flex justify-between items-center mb-2">
                <h3 class="font-bold text-lg text-gray-100 flex-grow editable-wrapper"><span class="editable-name wildcard-name outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit list name">${name.replace(/_/g, ' ')}</span><span class="edit-icon" title="Double-click to edit">✏️</span> <span class="wildcard-count text-gray-400 text-sm ml-2">(${(data.wildcards || []).length})</span></h3>
            </div>
            <div class="editable-wrapper w-full items-center my-2">
            <input type="text" readonly aria-label="Custom instructions" class="editable-input custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 w-full focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200" placeholder="Custom generation instructions..." value="${sanitize(data.instruction || '')}">
            <span class="edit-icon" title="Double-click to edit">✏️</span>
        </div>
            <div class="chip-container custom-scrollbar flex flex-wrap gap-2 card-folder rounded-md p-2 w-full border border-gray-600 overflow-y-auto" style="max-height: 150px; min-height: 2.5rem;">
                ${(data.wildcards && data.wildcards.length > 0) ? data.wildcards.map((wc, i) => this.createChip(wc, i)).join('') : this.getEmptyListHtml()}
            </div>
            <div class="flex gap-2 mt-2">
                <input type="text" aria-label="New wildcard text" placeholder="Add new wildcard..." class="add-wildcard-input flex-grow input-primary px-2 py-1 text-sm">
                <button class="add-wildcard-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-md" aria-label="Add wildcard item">+
                </button>
            </div>
            <div class="flex justify-between items-center mt-3 flex-wrap gap-2">
                <button class="generate-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center gap-2 shadow-sm hover:shadow-md transition-all"><span class="btn-text">Generate More</span><div class="loader hidden"></div></button>
                <div class="flex gap-1 ml-auto">
                    <button class="copy-btn btn-secondary text-gray-400 hover:text-white p-2 rounded-md transition-colors" title="Copy all wildcards" aria-label="Copy all wildcards"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="select-all-btn btn-secondary text-xs py-1.5 px-2 rounded-md" title="Select All">Select All</button>
                    <button class="batch-delete-btn bg-red-900/50 hover:bg-red-700 text-red-200 hover:text-white text-xs py-1.5 px-2 rounded-md transition-colors" title="Delete Selected">Delete</button>
                </div>
            </div>
        `;
    },

    createChip(wildcard, index) {
        return `<div class="chip chip-base text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap" data-index="${index}"><input type="checkbox" aria-label="Select ${sanitize(wildcard)}" class="batch-select bg-gray-700 border-gray-500 text-indigo-600 focus:ring-indigo-500"><span class="editable-name chip-text outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit item">${sanitize(wildcard)}</span></div>`;
    },

    createPlaceholderCategory() {
        const div = document.createElement('div');
        div.className = 'placeholder-category card-folder rounded-lg shadow-md mt-4';
        div.innerHTML = `
            <div class="p-4 flex flex-wrap justify-between items-center gap-4">
                <h2 class="text-xl sm:text-2xl font-semibold text-accent">Add New Top-Level Category</h2>
                <div class="flex items-center gap-2">
                    <button id="add-category-placeholder-btn" class="add-category-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md" aria-label="Add new top-level category">+</button>
                    <button id="suggest-toplevel-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Suggest</button>
                </div>
            </div>`;
        return div;
    },
    createSubcategoryPlaceholder(parentPath) {
        const div = document.createElement('div');
        div.className = 'bg-gray-800/50 p-4 rounded-lg flex items-center justify-between border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors mt-2 mb-4';
        div.dataset.parentPath = parentPath;
        div.innerHTML = `
            <span class="text-gray-400 font-medium">Add new subcategory</span>
            <div class="flex gap-2">
                <button class="add-subcategory-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md" aria-label="Add new subcategory">+</button>
                <button class="suggest-subcategory-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-md">Suggest</button>
            </div>
        `;
        return div;
    },
    createWildcardPlaceholder(parentPath) {
        const div = document.createElement('div');
        div.className = 'bg-gray-700/50 p-4 rounded-lg flex flex-col min-h-[288px]';
        div.dataset.parentPath = parentPath;
        div.innerHTML = `
             <div class="flex-grow flex flex-col items-center justify-center text-center">
                 <p class="text-gray-400 mb-4">Add new wildcard list</p>
                 <div class="flex gap-4">
                    <button class="add-wildcard-list-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-2xl" aria-label="Add new wildcard list">+</button>
                    <button class="suggest-wildcard-list-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Suggest</button>
                </div>
            </div>`;
        return div;
    },

    updateStats() {
        let categoryCount = 0;
        let wildcardCount = 0;
        const countData = (data) => {
            Object.keys(data).filter(k => k !== 'instruction').forEach(key => {
                const item = data[key];
                if (item.wildcards && Array.isArray(item.wildcards)) {
                    categoryCount++;
                    wildcardCount += item.wildcards.length;
                } else if (typeof item === 'object' && item !== null) {
                    countData(item);
                }
            });
        };
        countData(State.state.wildcards || {});
        // Update DOM
        if (this.elements.statsBar) {
            this.elements.statsBar.querySelector('#stat-categories').textContent = categoryCount;
            this.elements.statsBar.querySelector('#stat-wildcards').textContent = wildcardCount.toLocaleString();
            this.elements.statsBar.querySelector('#stat-pinned').textContent = (State.state.pinnedCategories || []).length;
        }
    },

    showNotification(message, isConfirmation = false, onConfirm = null, withInput = false, customButtons = null) {
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
            setTimeout(() => inputElement.focus(), 100);
        }

        this.elements.dialogConfirmButtons.classList.toggle('hidden', !isConfirmation && !customButtons);
        this.elements.dialogClose.classList.toggle('hidden', isConfirmation || !!customButtons);

        // Handle custom buttons
        if (customButtons) {
            this.elements.dialogConfirmButtons.innerHTML = '';
            customButtons.forEach(btn => {
                const b = document.createElement('button');
                b.textContent = btn.text;
                b.className = btn.class || 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded';
                b.onclick = btn.onClick;
                this.elements.dialogConfirmButtons.appendChild(b);
            });
        } else {
            // Restore default buttons if needed (they might have been removed)
            if (this.elements.dialogConfirmButtons.children.length === 0 || !this.elements.dialogConfirmButtons.contains(this.elements.dialogConfirm)) {
                this.elements.dialogConfirmButtons.innerHTML = '';
                this.elements.dialogConfirmButtons.appendChild(this.elements.dialogCancel);
                this.elements.dialogConfirmButtons.appendChild(this.elements.dialogConfirm);
            }

            this.elements.dialogConfirm.onclick = () => {
                this.elements.dialog.close('confirm');
                if (onConfirm) onConfirm(inputElement ? inputElement.value : null);
            };
            this.elements.dialogCancel.onclick = () => this.elements.dialog.close('cancel');
        }

        this.elements.dialogClose.onclick = () => this.elements.dialog.close('close');

        this.elements.dialog.showModal();
    },

    saveAllSettings() {
        if (!this.elements.settingsDialog) return;
        const inputs = this.elements.settingsDialog.querySelectorAll('input, select, textarea');
        inputs.forEach(el => {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        UI.showToast('Settings saved', 'success');
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        // Check if a dialog is open - if so, render toast inside it for visibility
        const openDialog = document.querySelector('dialog[open]');
        if (openDialog) {
            // Find or create a toast container inside the dialog
            let dialogToastContainer = openDialog.querySelector('.dialog-toast-container');
            if (!dialogToastContainer) {
                dialogToastContainer = document.createElement('div');
                dialogToastContainer.className = 'dialog-toast-container toast-container';
                openDialog.appendChild(dialogToastContainer);
            }
            dialogToastContainer.appendChild(toast);
        } else {
            this.elements.toastContainer.appendChild(toast);
        }

        setTimeout(() => toast.remove(), 3000);
    },

    populateModelList(provider, models) {
        if (provider !== 'openrouter') return; // Currently only robustly supporting OpenRouter

        State.state.availableModels = models; // Cache raw models
        this.filterAndRenderModels(provider);
    },

    filterAndRenderModels(provider) {
        const models = State.state.availableModels || [];
        const datalist = document.getElementById(`${provider}-model-list`);
        if (!datalist) return;

        const freeOnly = /** @type {HTMLInputElement|null} */ (document.getElementById(`${provider}-free-only`))?.checked;
        const jsonOnly = /** @type {HTMLInputElement|null} */ (document.getElementById(`${provider}-json-only`))?.checked;

        datalist.innerHTML = '';

        const filtered = models.filter(m => {
            // Check Free
            if (freeOnly) {
                const pricing = m.pricing;
                // OpenRouter pricing is string. "0" or "0.0" usually.
                const isFree = pricing &&
                    (parseFloat(pricing.prompt) === 0) &&
                    (parseFloat(pricing.completion) === 0);
                if (!isFree) return false;
            }

            // Check JSON
            if (jsonOnly) {
                // Check supported_parameters
                /*
                  Example m structure:
                  {
                    id: "openai/gpt-3.5-turbo",
                    supported_parameters: ["response_format", ...],
                    ...
                  }
                */
                // Some models might not have the field populated, assume false then.
                const supportsJson = m.supported_parameters && m.supported_parameters.includes('response_format');
                if (!supportsJson) return false;
            }
            return true;
        });

        // Sort: Free ones first? Or just alphabetical?
        filtered.sort((a, b) => a.id.localeCompare(b.id));

        filtered.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            // Removed secondary text label for cleaner UI as requested
            datalist.appendChild(option);
        });

        // Update count helper?
        const loadingInd = document.getElementById(`${provider}-model-loading-indicator`);
        if (loadingInd) {
            loadingInd.textContent = `${filtered.length} models available`;
            loadingInd.classList.remove('hidden', 'animate-pulse');
            loadingInd.classList.add('text-green-400');
        }
    },

    /**
     * Update the status badge next to a prompt textarea
     * @param {string} textareaId - ID of the textarea element
     * @param {string} configKey - Config key to check (CUSTOM_SYSTEM_PROMPT or CUSTOM_SUGGEST_PROMPT)
     */
    updatePromptStatusBadge(textareaId, configKey) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        const wrapper = textarea.closest('.prompt-field-wrapper');
        if (!wrapper) return;

        const badge = wrapper.querySelector('.prompt-status-badge');
        const resetBtn = wrapper.querySelector('.reset-prompt-btn');

        if (!badge) return;

        const usingDefault = isUsingDefault(configKey);

        if (usingDefault) {
            badge.textContent = 'Default';
            badge.classList.remove('badge-custom');
            badge.classList.add('badge-default');
            if (resetBtn) resetBtn.classList.add('hidden');
        } else {
            badge.textContent = 'Custom';
            badge.classList.remove('badge-default');
            badge.classList.add('badge-custom');
            if (resetBtn) resetBtn.classList.remove('hidden');
        }
    },

    /**
     * Handle reset button click for prompts
     * @param {string} promptType - 'system' or 'suggest'
     */
    handleResetPrompt(promptType) {
        const textareaId = promptType === 'system' ? 'global-prompt' : 'suggestion-prompt';
        const configKey = promptType === 'system' ? 'CUSTOM_SYSTEM_PROMPT' : 'CUSTOM_SUGGEST_PROMPT';

        resetToDefault(configKey);

        /** @type {HTMLTextAreaElement|null} */
        // @ts-ignore
        const textarea = document.getElementById(textareaId);
        if (textarea) {
            textarea.value = getEffectivePrompt(promptType);
        }

        this.updatePromptStatusBadge(textareaId, configKey);
        this.showToast('Reset to default', 'info');
    }
};

