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
                }, 700);
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
        document.getElementById('template-prompt')?.addEventListener('input', (e) => {
            setCustomPrompt('template', /** @type {HTMLTextAreaElement} */(e.target).value);
            this.updatePromptStatusBadge('template-prompt', 'CUSTOM_TEMPLATE_PROMPT');
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
        const suggestionPrompt = /** @type {HTMLTextAreaElement} */ (document.getElementById('suggestion-prompt'));
        /** @type {HTMLTextAreaElement|null} */
        // @ts-ignore
        const templatePrompt = document.getElementById('template-prompt');
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
        if (templatePrompt) {
            templatePrompt.value = getEffectivePrompt('template');
            this.updatePromptStatusBadge('template-prompt', 'CUSTOM_TEMPLATE_PROMPT');
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

            if (path[0] === 'templatePrompt') {
                const templatePrompt = document.getElementById('template-prompt');
                // @ts-ignore
                if (templatePrompt) templatePrompt.value = value || '';
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
                // Bind Save Logic
                urlSection.querySelector('input').addEventListener('change', (e) => {
                    Config.API_URL_CUSTOM = /** @type {HTMLInputElement} */ (e.target).value;
                    saveConfig();
                });
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

        // Clear previous highlights before scanning
        this.clearSearchHighlights();

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
                const chips = el.querySelectorAll('.chip .editable-name');
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

        // Apply highlights after filtering if there's a query
        if (normalizedQuery) {
            this.applySearchHighlights(normalizedQuery);

            // Also highlight in Mindmap view if available
            // @ts-ignore
            if (window.Mindmap?.highlightSearch) {
                // @ts-ignore
                window.Mindmap.highlightSearch(normalizedQuery);
            }
        } else {
            // Clear mindmap highlights when search is cleared
            // @ts-ignore
            if (window.Mindmap?.highlightSearch) {
                // @ts-ignore
                window.Mindmap.highlightSearch('');
            }
        }

        // Enhancement #6: Empty Search State
        let emptyState = document.getElementById('search-empty-state');
        if (matchCount === 0 && normalizedQuery !== '') {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'search-empty-state';
                emptyState.className = 'text-center p-8 text-gray-500 animate-fade-in';
                emptyState.innerHTML = `
                    <div class="text-4xl mb-2 opacity-50">🔍</div>
                    <p class="text-lg">No wildcards found for "<span class="font-bold text-gray-400 search-term"></span>"</p>
                    <button class="clear-search-link text-indigo-400 hover:text-indigo-300 underline mt-2 text-sm">Clear search</button>
                `;
                this.elements.container.appendChild(emptyState);

                // Add click handler
                const link = /** @type {HTMLElement | null} */ (emptyState.querySelector('.clear-search-link'));
                if (link) link.onclick = () => {
                    const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('search-wildcards'));
                    if (searchInput) {
                        searchInput.value = '';
                        searchInput.dispatchEvent(new Event('input'));
                        searchInput.focus();
                    }
                };
            }
            const termSpan = emptyState.querySelector('.search-term');
            if (termSpan) termSpan.textContent = query;
            emptyState.classList.remove('hidden');
        } else {
            if (emptyState) emptyState.classList.add('hidden');
        }

        if (this.elements.searchResultsCount) {
            this.elements.searchResultsCount.textContent = normalizedQuery ? `${matchCount} matches` : '';
        }
    },

    /**
     * Remove all search highlights from the UI
     */
    clearSearchHighlights() {
        document.querySelectorAll('mark.search-highlight').forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
                parent.normalize(); // Merge adjacent text nodes
            }
        });
    },

    /**
     * Apply search highlights to matching text in visible elements
     * @param {string} query - The normalized search query
     */
    applySearchHighlights(query) {
        if (!query) return;

        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

        // Highlight in category names (only visible ones)
        document.querySelectorAll('.category-item:not(.hidden) .category-name').forEach(el => {
            this.highlightTextInElement(el, regex);
        });

        // Highlight in wildcard names (only visible ones)
        document.querySelectorAll('.wildcard-card:not(.hidden) .wildcard-name').forEach(el => {
            this.highlightTextInElement(el, regex);
        });

        // Highlight in wildcard chips (only visible ones)
        document.querySelectorAll('.wildcard-card:not(.hidden) .chip .editable-name').forEach(el => {
            this.highlightTextInElement(el, regex);
        });
    },

    /**
     * Wrap matching text in an element with a highlight mark
     * @param {Element} el - The element to highlight text in
     * @param {RegExp} regex - The regex to match
     */
    highlightTextInElement(el, regex) {
        const text = el.textContent || '';
        if (!regex.test(text)) return;

        // Reset regex lastIndex for next use
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            // Add highlighted match
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            lastIndex = regex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        // Replace element content
        el.textContent = '';
        el.appendChild(fragment);
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
        gridWrapper.className = 'grid gap-4 w-full';
        gridWrapper.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
        leafNodes.forEach(node => gridWrapper.appendChild(node));

        // Placeholders
        gridWrapper.appendChild(this.createWildcardPlaceholder(path));

        contentWrapper.appendChild(this.createSubcategoryPlaceholder(path));
        contentWrapper.appendChild(gridWrapper);
    },

    createWildcardCardElement(name, data, level, path) {
        const element = document.createElement('div');
        element.className = `card-wildcard p-2 rounded-lg flex flex-col level-${level} wildcard-card`;
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
            // Re-render chips + add-chip-btn. Diffing individual chips is Overkill for V1, but better than full page re-render.
            const wildcards = data.wildcards || [];
            const chipsHtml = wildcards.length > 0
                ? wildcards.map((wc, i) => this.createChip(wc, i)).join('')
                : this.getEmptyListHtml();
            const addBtnHtml = `<button class="add-chip-btn chip chip-base text-xs px-1.5 py-0.5 rounded flex items-center gap-1 bg-green-600/50 hover:bg-green-600 cursor-pointer" title="Add new item">+</button>`;
            chipContainer.innerHTML = addBtnHtml + chipsHtml;
        }
    },

    getEmptyListHtml() {
        return `
            <span class="empty-state text-gray-500 italic text-xs select-none">No items yet</span>
        `;
    },

    getCategoryFolderHtml(name, data, path) {
        const isPinned = State.state.pinnedCategories && State.state.pinnedCategories.includes(path);
        const instruction = data.instruction || '';
        const tooltipText = instruction ? `${name.replace(/_/g, ' ')}: ${instruction}` : name.replace(/_/g, ' ');
        return `
            <summary class="flex justify-between items-center p-2 cursor-pointer gap-2 group/catheader" title="${sanitize(tooltipText)}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <input type="checkbox" aria-label="Select category" class="category-batch-checkbox w-3.5 h-3.5 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500 flex-shrink-0" onclick="event.stopPropagation();">
                    <h2 class="text-lg font-semibold text-accent select-none editable-wrapper flex-shrink-0"><span class="editable-name category-name outline-none rounded px-0.5" tabindex="0">${name.replace(/_/g, ' ')}</span><span class="edit-icon">✏️</span></h2>
                    <input type="text" 
                        class="custom-instructions-input editable-input text-sm text-gray-500 bg-transparent border-0 outline-none ml-2 flex-grow min-w-[100px] focus:text-gray-300 focus:bg-gray-800/50 rounded px-1 transition-colors truncate hidden sm:block cursor-pointer read-only:cursor-pointer" 
                        value="${sanitize(instruction)}" 
                        placeholder="Add description..."
                        readonly>
                </div>
                <div class="flex items-center gap-1 ml-auto flex-shrink-0">
                    <div class="flex items-center gap-1 opacity-0 group-hover/catheader:opacity-100 transition-opacity duration-200">
                        <button class="pin-btn header-icon-btn text-yellow-400" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? '📌' : '📍'}</button>
                        <button class="delete-btn header-icon-btn text-red-400" title="Delete">🗑</button>
                    </div>
                    <span class="arrow-down transition-transform duration-300 text-accent text-sm">▼</span>
                </div>
            </summary>
            <div class="content-wrapper p-2 border-t border-gray-700/50 flex flex-col gap-2"></div>
        `;
    },

    getWildcardCardHtml(name, data, path) {
        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')).replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top Level';
        const instruction = data.instruction || '';
        const tooltipText = `Path: ${parentPath}${instruction ? ' | ' + instruction : ''}`;
        const isTemplateCard = path.startsWith('0_TEMPLATES');
        return `
            <!-- Compact Header: Title + Action Icons -->
            <div class="flex items-center gap-2 mb-1 group/header" title="${sanitize(tooltipText)}">
                <input type="checkbox" aria-label="Select list" class="card-batch-checkbox w-3.5 h-3.5 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500 flex-shrink-0" onclick="event.stopPropagation();">
                <h3 class="font-bold text-sm text-gray-100 editable-wrapper flex-shrink-0"><span class="editable-name wildcard-name outline-none rounded px-0.5" tabindex="0">${name.replace(/_/g, ' ')}</span><span class="edit-icon">✏️</span></h3>
                <input type="text" 
                    class="custom-instructions-input editable-input text-xs text-gray-500 bg-transparent border-0 outline-none flex-grow min-w-[50px] focus:text-gray-300 focus:bg-gray-800/50 rounded px-1 transition-colors truncate hidden sm:block cursor-pointer read-only:cursor-pointer" 
                    value="${sanitize(instruction)}" 
                    placeholder="Add desc..." 
                    readonly>
                <span class="wildcard-count text-gray-500 text-xs flex-shrink-0">(${(data.wildcards || []).length})</span>
                <!-- Header Action Icons -->
                <div class="flex items-center gap-0.5 ml-auto header-actions opacity-0 group-hover/header:opacity-100 transition-opacity duration-200">
                    <button class="generate-btn header-icon-btn" title="${isTemplateCard ? 'Generate Templates' : 'Generate More'}">🎲<div class="loader hidden"></div></button>
                    <button class="copy-btn header-icon-btn hidden" title="Copy selected" data-original-title="Copy selected">📋</button>
                    <button class="batch-delete-btn header-icon-btn text-red-400 hidden" title="Delete Selected">🗑</button>
                    <button class="select-all-btn header-icon-btn" title="Select All">☑</button>
                    <button class="delete-btn header-icon-btn text-red-400" title="Delete Card">✕</button>
                </div>
            </div>
            <!-- Chips Container -->
            <div class="chip-container custom-scrollbar flex flex-wrap gap-1 card-folder rounded p-1 w-full border border-gray-600/50 overflow-y-auto" style="max-height: 80px; min-height: 1.5rem;">
                <button class="add-chip-btn chip chip-base text-xs px-1.5 py-0.5 rounded flex items-center gap-1 bg-green-600/50 hover:bg-green-600 cursor-pointer" title="Add new item">+</button>
                ${(data.wildcards && data.wildcards.length > 0) ? data.wildcards.map((wc, i) => this.createChip(wc, i)).join('') : this.getEmptyListHtml()}
            </div>
            <!-- Hidden Add Input (revealed on + click) -->
            <div class="add-input-row hidden flex gap-1 mt-1">
                <input type="text" aria-label="New wildcard" placeholder="Add item (Enter)" class="add-wildcard-input flex-grow input-primary px-2 py-0.5 text-xs">
                <button class="add-wildcard-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 rounded">Add</button>
                <button class="cancel-add-btn text-gray-400 hover:text-white text-xs px-1">✕</button>
            </div>
        `;
    },

    createChip(wildcard, index) {
        return `<div class="chip chip-base text-xs px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap cursor-pointer select-none" data-index="${index}" tabindex="0" role="checkbox" aria-checked="false" aria-label="Select ${sanitize(wildcard)}"><span class="editable-name chip-text outline-none rounded px-0.5" aria-label="Double-click to edit item">${sanitize(wildcard)}</span></div>`;
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
        div.className = 'placeholder-subcategory p-2 rounded-lg flex items-center justify-between border border-dashed border-gray-600 hover:border-indigo-500 transition-colors mt-2 mb-2 bg-gray-800/30';
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
        div.className = 'placeholder-wildcard p-2 rounded-lg flex items-center justify-between min-h-[50px] border border-dashed border-gray-600 hover:border-indigo-500 transition-colors bg-gray-700/20';
        div.dataset.parentPath = parentPath;
        div.innerHTML = `
            <span class="text-gray-400 text-sm font-medium">Add list</span>
            <div class="flex gap-2">
                 <button class="add-wildcard-list-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md" aria-label="Add new wildcard list">+</button>
                 <button class="suggest-wildcard-list-btn bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-1 px-3 rounded-md">Suggest</button>
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
            this.elements.dialogMessage.classList.remove('whitespace-pre-wrap');
            this.elements.dialogMessage.innerHTML = message;
        } else {
            this.elements.dialogMessage.classList.add('whitespace-pre-wrap');
            const p = document.createElement('p');
            p.textContent = message;
            this.elements.dialogMessage.appendChild(p);
        }

        if (withInput) {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'bg-gray-900 border border-gray-600 rounded-md p-2 text-sm w-full mt-2';
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

        // Enhancement #9: Auto-focus first input
        const firstInput = this.elements.dialog.querySelector('input:not([type="hidden"]), textarea, select');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 50);
        }
    },

    /**
     * Show dialog for selecting wildcard categories as template sources.
     * @param {Array<{path: string, name: string, topLevel: string}>} wildcardPaths
     * @param {function(string[]): void} onConfirm - Callback with selected paths
     */
    showTemplateSourcesDialog(wildcardPaths, onConfirm) {
        // Group by top-level category
        const grouped = {};
        wildcardPaths.forEach(item => {
            if (!grouped[item.topLevel]) grouped[item.topLevel] = [];
            grouped[item.topLevel].push(item);
        });

        const html = `
            <div class="space-y-3 max-w-lg">
                <div class="flex items-center gap-2">
                    <span class="text-2xl">🏗️</span>
                    <h3 class="text-xl font-bold text-white">Select Template Sources</h3>
                </div>
                <p class="text-xs text-gray-400">Choose wildcard categories to combine into templates:</p>
                
                <div class="flex gap-2 text-xs mb-2">
                    <button id="tpl-select-all" class="text-indigo-400 hover:text-indigo-300 hover:underline">Select All</button>
                    <span class="text-gray-600">|</span>
                    <button id="tpl-select-none" class="text-indigo-400 hover:text-indigo-300 hover:underline">Select None</button>
                </div>
                
                <div class="max-h-[50vh] overflow-y-auto space-y-1 custom-scrollbar pr-1">
                    ${Object.entries(grouped).map(([topLevel, items]) => `
                        <details class="bg-gray-800/50 rounded border border-gray-700" open>
                            <summary class="p-2 cursor-pointer text-sm font-medium flex items-center gap-2 hover:bg-gray-700/50">
                                <input type="checkbox" class="tpl-group-toggle w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded" data-group="${sanitize(topLevel)}" checked>
                                <span>${sanitize(topLevel.replace(/_/g, ' '))}</span>
                                <span class="text-xs text-gray-500 ml-auto">(${items.length})</span>
                            </summary>
                            <div class="p-2 pt-0 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                ${items.map(item => `
                                    <label class="flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-700/30 cursor-pointer">
                                        <input type="checkbox" class="tpl-path-cb w-3 h-3 text-indigo-600 bg-gray-700 border-gray-600 rounded" data-path="${sanitize(item.path)}" checked>
                                        <span class="truncate text-gray-300" title="${sanitize(item.path)}">${sanitize(item.name)}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </details>
                    `).join('')}
                </div>
                
                <div class="text-xs text-gray-500 pt-2 border-t border-gray-700 flex justify-between">
                    <span><span id="tpl-count">${wildcardPaths.length}</span> categories selected</span>
                    <span class="text-indigo-400">Min: 2 required</span>
                </div>
            </div>
        `;

        this.showNotification(html, false, null, false, [
            {
                text: 'Generate Templates',
                class: 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded',
                onClick: () => {
                    const selected = Array.from(document.querySelectorAll('.tpl-path-cb:checked'))
                        .map(cb => /** @type {HTMLInputElement} */(cb).dataset.path);
                    onConfirm(selected);
                }
            },
            {
                text: 'Cancel',
                class: 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded',
                onClick: () => this.elements.dialog.close()
            }
        ]);

        // Bind helper listeners after dialog is shown
        setTimeout(() => {
            const updateCount = () => {
                const count = document.querySelectorAll('.tpl-path-cb:checked').length;
                const countEl = document.getElementById('tpl-count');
                if (countEl) countEl.textContent = String(count);
            };

            document.getElementById('tpl-select-all')?.addEventListener('click', () => {
                document.querySelectorAll('.tpl-path-cb, .tpl-group-toggle').forEach(cb =>
                    /** @type {HTMLInputElement} */(cb).checked = true);
                updateCount();
            });

            document.getElementById('tpl-select-none')?.addEventListener('click', () => {
                document.querySelectorAll('.tpl-path-cb, .tpl-group-toggle').forEach(cb =>
                    /** @type {HTMLInputElement} */(cb).checked = false);
                updateCount();
            });

            // Group toggle affects all children
            document.querySelectorAll('.tpl-group-toggle').forEach(toggle => {
                toggle.addEventListener('change', (e) => {
                    const checked = /** @type {HTMLInputElement} */(e.target).checked;
                    const group = /** @type {HTMLInputElement} */(e.target).dataset.group;
                    const details = /** @type {HTMLElement} */(e.target).closest('details');
                    details?.querySelectorAll('.tpl-path-cb').forEach(cb =>
                        /** @type {HTMLInputElement} */(cb).checked = checked);
                    updateCount();
                });
            });

            document.querySelectorAll('.tpl-path-cb').forEach(cb =>
                cb.addEventListener('change', updateCount));
        }, 50);
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

    showConfirmDialog(title, message, options = {}) {
        return new Promise((resolve) => {
            const { confirmText = 'Confirm', cancelText = 'Cancel', danger = false, rememberKey = null } = options;

            // Check for remembered choice (only if 'rememberKey' is provided)
            if (rememberKey && localStorage.getItem(rememberKey) === 'true') {
                resolve(true);
                return;
            }

            const dialog = document.createElement('dialog');
            dialog.className = 'confirm-dialog bg-gray-800 rounded-lg p-0 shadow-xl border border-gray-700 max-w-sm w-full backdrop:bg-black/50 backdrop:backdrop-blur-sm';

            dialog.innerHTML = `
                <div class="p-4 border-b border-gray-700/50">
                    <h3 class="text-lg font-bold text-gray-100">${title}</h3>
                </div>
                <div class="p-4 text-gray-300 text-sm">
                    <p>${message}</p>
                    ${rememberKey ? `
                    <label class="flex items-center gap-2 mt-4 cursor-pointer text-gray-400 hover:text-gray-300 select-none">
                        <input type="checkbox" id="confirm-remember-choice" class="w-3.5 h-3.5 bg-gray-700 border-gray-600 rounded text-indigo-500 focus:ring-indigo-500">
                        <span>Don't ask again</span>
                    </label>
                    ` : ''}
                </div>
                <div class="p-3 bg-gray-900/50 flex justify-end gap-2 rounded-b-lg">
                    <button class="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors" id="btn-cancel">${cancelText}</button>
                    <button class="px-3 py-1.5 rounded text-sm font-medium text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} transition-colors" id="btn-confirm">${confirmText}</button>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.showModal();

            const handleClose = (result) => {
                if (rememberKey) {
                    const remember = dialog.querySelector('#confirm-remember-choice')?.checked;
                    // Only save if action was confirmed and "don't ask again" was checked
                    if (result && remember) {
                        localStorage.setItem(rememberKey, 'true');
                    }
                }

                dialog.close();
                dialog.remove();
                resolve(result);
            };

            const cancelBtn = dialog.querySelector('#btn-cancel');
            const confirmBtn = dialog.querySelector('#btn-confirm');

            cancelBtn.addEventListener('click', () => handleClose(false));
            confirmBtn.addEventListener('click', () => handleClose(true));

            dialog.addEventListener('cancel', () => handleClose(false)); // Handle Escape key

            // Focus confirm button by default for quick action
            confirmBtn.focus();
        });
    },

    populateModelList(provider, models) {
        if (provider !== 'openrouter') return; // Currently only robustly supporting OpenRouter

        State.state.availableModels = models; // Cache raw models
        this.filterAndRenderModels(provider);
    },

    filterAndRenderModels(provider) {
        const models = State.state.availableModels || [];
        const datalist = document.getElementById(`${provider} - model - list`);
        if (!datalist) return;

        const freeOnly = /** @type {HTMLInputElement|null} */ (document.getElementById(`${provider} - free - only`))?.checked;
        const jsonOnly = /** @type {HTMLInputElement|null} */ (document.getElementById(`${provider} - json - only`))?.checked;

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
        const loadingInd = document.getElementById(`${provider} - model - loading - indicator`);
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
    },

    /**
 * Show the Clean Up Duplicates dialog (accessed from Dupe Finder bar)
 * @param {Array} duplicates - List of duplicate objects
 */
    showCleanDuplicatesDialog(duplicates) {
        const totalOccurrences = duplicates.reduce((sum, d) => sum + d.count, 0);

        // Build the main dialog content - simplified for cleanup only
        const message = `
            <div class="text-left space-y-4">
<div class="flex items-center justify-between">
    <h3 class="text-xl font-bold text-white">🧹 Clean Up Duplicates</h3>
    <span class="bg-red-900/50 text-red-200 text-xs px-2 py-1 rounded border border-red-800">${duplicates.length} conflicts / ${totalOccurrences} items</span>
</div>

<p class="text-gray-400 text-sm">Choose which duplicate to keep when conflicts occur:</p>

<div class="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
    <div class="grid grid-cols-1 gap-2">
        <button id="dupe-clean-shortest" class="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors flex justify-between items-center group">
            <span>Keep <span class="text-green-400 font-semibold">Shortest Path</span> (Top-level)</span>
            <span class="opacity-0 group-hover:opacity-100 text-xs text-gray-400">Recommended</span>
        </button>
        <button id="dupe-clean-longest" class="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors">
            <span>Keep <span class="text-purple-400 font-semibold">Longest Path</span> (Most Nested)</span>
        </button>
    </div>
</div>

<details class="bg-gray-900/50 rounded-lg border border-gray-800">
    <summary class="p-2 cursor-pointer text-gray-400 hover:text-gray-300 text-sm font-medium select-none">
        View Duplicate List
    </summary>
    <div class="p-2 pt-0 max-h-40 overflow-y-auto custom-scrollbar">
        <ul class="space-y-1 text-sm">
            ${duplicates.map(d => `
                <li class="flex justify-between items-start py-1 border-b border-gray-800 last:border-0">
                    <span class="text-gray-300 font-mono text-xs bg-gray-800 px-1 rounded">"${d.normalized}"</span>
                    <span class="text-gray-500 text-xs text-right whitespace-nowrap ml-2">${d.count} locs</span>
                </li>
            `).join('')}
        </ul>
    </div>
</details>
</div>
    `;

        this.showNotification(message, false, null, false);

        // Bind actions
        setTimeout(() => {
            // Cleaning actions
            document.getElementById('dupe-clean-shortest')?.addEventListener('click', () => {
                this.handleCleanDuplicates(duplicates, 'shortest-path');
            });
            document.getElementById('dupe-clean-longest')?.addEventListener('click', () => {
                this.handleCleanDuplicates(duplicates, 'longest-path');
            });
        }, 100);
    },

    // Keep legacy name for backwards compatibility
    showCheckDuplicatesDialog(duplicates) {
        this.showCleanDuplicatesDialog(duplicates);
    },

    handleCleanDuplicates(duplicates, strategy) {
        const removed = State.cleanDuplicates(duplicates, strategy);
        this.elements.dialog.close();

        if (removed > 0) {
            UI.showToast(`Cleaned up ${removed} duplicates.`, 'success');
            // Refresh logic handled by State proxy -> handleStateUpdate -> renderAll (usually)
            // But since cleanDuplicates might modify multiple nested arrays silently without triggering full replaces in a way UI expects for granular reflow, 
            // or if we did granular, it might be complex. 
            // cleanDuplicates in State triggers delete/splice on arrays. Proxy should catch 'set'/'deleteProperty'.
            // However, array splice triggers multiple ops. 
            // Let's force a reload or check if reactive updates covered it. State.proxy usually handles array mutations.
        } else {
            UI.showToast('No duplicates removed.', 'info');
        }
    },

    highlightDuplicates(duplicates) {
        if (!duplicates || duplicates.length === 0) return;

        const duplicateMap = new Set(duplicates.map(d => d.normalized));
        const chips = document.querySelectorAll('.chip');
        let count = 0;

        chips.forEach(chip => {
            const nameEl = chip.querySelector('.editable-name');
            if (nameEl) {
                const text = nameEl.textContent?.toLowerCase().trim();
                if (text && duplicateMap.has(text)) {
                    chip.classList.add('chip-duplicate');
                    count++;
                }
            }
        });

        // Also highlight in mindmap view if active
        import('./modules/mindmap.js').then(({ Mindmap }) => {
            if (Mindmap.currentView === 'mindmap' || Mindmap.currentView === 'dual') {
                const mindmapCount = Mindmap.highlightDuplicates(duplicates);
                if (mindmapCount) {
                    count += mindmapCount;
                }
            }
        }).catch(() => {
            // Mindmap module not available, ignore
        });

        UI.showToast(`Highlighted ${count} occurrences`, 'success');
    },

    filterToDuplicates(duplicates) {
        if (!duplicates || duplicates.length === 0) return;

        const paths = new Set();
        duplicates.forEach(d => d.locations.forEach(loc => paths.add(loc.path)));

        // Check if we're in mindmap view
        import('./modules/mindmap.js').then(({ Mindmap }) => {
            if (Mindmap.currentView === 'mindmap') {
                // In mindmap view, use mindmap's filter functionality
                Mindmap.filterToDuplicates(duplicates);
            } else {
                // In list view, filter the cards as before
                this._filterListToDuplicates(paths, duplicates);
            }
        }).catch(() => {
            // Fallback if mindmap module not available
            this._filterListToDuplicates(paths, duplicates);
        });
    },

    /**
     * Internal method to filter list view to duplicates
     * @param {Set<string>} paths - Set of paths with duplicates
     * @param {Array} duplicates - The duplicates array
     */
    _filterListToDuplicates(paths, duplicates) {
        // Hide all cards first
        document.querySelectorAll('.wildcard-card').forEach(card => {
            const path = /** @type {HTMLElement} */ (card).dataset.path;
            if (paths.has(path)) {
                card.classList.remove('hidden');
                card.classList.add('duplicate-focus');

                // Expand parents
                const parts = path.split('/');
                let currentPath = '';
                parts.forEach((part, i) => {
                    currentPath += (i > 0 ? '/' : '') + part;
                    const details = document.querySelector(`details[data-path="${currentPath}"]`);
                    if (details) /** @type {HTMLDetailsElement} */ (details).open = true;
                });
            } else {
                card.classList.add('hidden');
            }
        });

        this.highlightDuplicates(duplicates);
        this._showFilterExitButton();
        UI.showToast(`Filtered to ${paths.size} lists with duplicates`, 'success');
    },

    /**
     * Enter Duplicate Finder Mode
     * - Forces Show Wildcards ON
     * - Highlights duplicates
     * - Filters to show only categories with duplicates
     * - Shows floating bar with Clean Up + Exit buttons
     */
    enterDupeFinderMode() {
        const { duplicates } = State.findDuplicates();

        if (duplicates.length === 0) {
            UI.showToast('No duplicates found! Your data is clean.', 'success');
            return;
        }

        // Force Show Wildcards ON (required to see duplicates)
        import('./modules/mindmap.js').then(({ Mindmap }) => {
            Mindmap.forceShowWildcards();

            // Apply filter (which also applies highlighting)
            this.filterToDuplicates(duplicates);
        }).catch(() => {
            // Fallback if mindmap module not available - just filter list view
            const paths = new Set();
            duplicates.forEach(d => d.locations.forEach(loc => paths.add(loc.path)));
            this._filterListToDuplicates(paths, duplicates);
        });

        UI.showToast(`Dupe Finder: ${duplicates.length} duplicate values found`, 'info');
    },

    _showFilterExitButton() {
        // Remove existing bar if any
        this._hideFilterExitButton();

        // Create floating bar with Clean Up + Exit buttons
        const bar = document.createElement('div');
        bar.id = 'dupe-finder-bar';
        bar.className = 'dupe-finder-bar';
        bar.innerHTML = `
            <button id="clean-duplicates-btn" class="btn-clean">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                🧹 Clean Duplicates
            </button>
            <button id="exit-dupe-finder-btn" class="btn-exit">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Exit Dupe Finder
            </button>
        `;

        // Wire up buttons
        bar.querySelector('#clean-duplicates-btn')?.addEventListener('click', () => {
            const { duplicates } = State.findDuplicates();
            this.showCleanDuplicatesDialog(duplicates);
        });

        bar.querySelector('#exit-dupe-finder-btn')?.addEventListener('click', () => {
            this.clearDuplicateHighlights();
        });

        // Add to the container
        const container = document.getElementById('wildcard-container')?.parentElement;
        if (container) {
            // Ensure the container can position the bar
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(bar);
        }
    },

    /**
     * Hide the Dupe Finder bar
     */
    _hideFilterExitButton() {
        const bar = document.getElementById('dupe-finder-bar');
        if (bar) bar.remove();
        // Also remove legacy button if present
        const btn = document.getElementById('exit-filter-btn');
        if (btn) btn.remove();
    },

    clearDuplicateHighlights() {
        document.querySelectorAll('.chip-duplicate').forEach(el => el.classList.remove('chip-duplicate'));
        document.querySelectorAll('.duplicate-focus').forEach(el => el.classList.remove('duplicate-focus'));

        // Hide the filter exit button
        this._hideFilterExitButton();

        // Clear mindmap highlights too
        import('./modules/mindmap.js').then(({ Mindmap }) => {
            Mindmap.clearDuplicateHighlights();
        }).catch(() => {
            // Mindmap module not available, ignore
        });

        // Restore visibility (simple reset search like behavior)
        const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-wildcards'));
        if (searchInput && searchInput.value) {
            this.handleSearch(searchInput.value);
        } else {
            document.querySelectorAll('.wildcard-card.hidden').forEach(el => el.classList.remove('hidden'));
        }

        UI.showToast('Cleared highlights', 'info');
    },

    /**
     * Toggle the overflow menu visibility
     * @param {boolean} show - true to show, false to hide
     */
    toggleOverflowMenu(show) {
        if (!this.elements.overflowMenuDropdown) return;
        if (show) {
            this.elements.overflowMenuDropdown.classList.remove('hidden');
        } else {
            this.elements.overflowMenuDropdown.classList.add('hidden');
        }
    }
};

