import { State } from './state.js';
import { sanitize } from './utils.js';
import { Config, saveConfig, saveApiKey, getEffectivePrompt, setCustomPrompt, isUsingDefault, resetToDefault } from './config.js';
import { Category } from './components/Category.js';
import { WildcardCard } from './components/WildcardCard.js';
import { Chip } from './components/Chip.js';
import { Modal } from './components/Modal.js';
import { Search } from './modules/search.js';

export const UI = {
    elements: {},
    _settingsDirty: false,

    init() {
        this.cacheElements();
        this.renderApiSettings();
        this.bindGlobalEvents();

        // Init Search
        if (this.elements.search) {
             Search.init(this.elements.search, this.elements.searchClearBtn, this.elements.searchResultsCount, this.elements.container);
        }
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

        // Settings Modal Handlers
        this.elements.settingsBtn?.addEventListener('click', () => {
            this._settingsDirty = false;
            this.elements.settingsDialog?.showModal();
        });

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

        this.elements.settingsDialog?.addEventListener('cancel', (e) => {
            if (this._settingsDirty) {
                e.preventDefault();
                requestCloseSettings();
            }
        });

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

        document.addEventListener('request-focus-path', (e) => this.focusPath(/** @type {CustomEvent} */(e).detail.path));

        document.getElementById('global-prompt')?.addEventListener('input', (e) => {
            setCustomPrompt('system', /** @type {HTMLTextAreaElement} */(e.target).value);
            this.updatePromptStatusBadge('global-prompt', 'CUSTOM_SYSTEM_PROMPT');
        });
        document.getElementById('suggestion-prompt')?.addEventListener('input', (e) => {
            setCustomPrompt('suggest', /** @type {HTMLTextAreaElement} */(e.target).value);
            this.updatePromptStatusBadge('suggestion-prompt', 'CUSTOM_SUGGEST_PROMPT');
        });

        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = /** @type {HTMLSelectElement} */ (e.target).value;
            Config.API_ENDPOINT = provider;
            saveConfig();
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

        // Populate prompts
        const globalPrompt = document.getElementById('global-prompt');
        const suggestionPrompt = document.getElementById('suggestion-prompt');
        const apiEndpoint = document.getElementById('api-endpoint');

        if (globalPrompt) {
            // @ts-ignore
            globalPrompt.value = getEffectivePrompt('system');
            this.updatePromptStatusBadge('global-prompt', 'CUSTOM_SYSTEM_PROMPT');
        }
        if (suggestionPrompt) {
            // @ts-ignore
            suggestionPrompt.value = getEffectivePrompt('suggest');
            this.updatePromptStatusBadge('suggestion-prompt', 'CUSTOM_SUGGEST_PROMPT');
        }
        if (apiEndpoint) {
            // @ts-ignore
            apiEndpoint.value = Config.API_ENDPOINT || 'openrouter';
            // @ts-ignore
            this.updateSettingsVisibility(apiEndpoint.value);
        }

        this.elements.container.innerHTML = '';

        const fragment = document.createDocumentFragment();

        let keys = Object.keys(wildcards);
        keys = this.sortKeys(keys, '');

        keys.forEach((key, index) => {
            const data = wildcards[key];
            const el = Category.create(key, data, 0, key, index, this.sortKeys.bind(this));
            fragment.appendChild(el);
        });

        fragment.appendChild(this.createPlaceholderCategory());
        this.elements.container.appendChild(fragment);

        this.updateStats();
    },

    // Needed for consistency with old UI calls if any, or just used internally
    createPlaceholderCategory() {
         return Category.createPlaceholderCategory(null);
    },

    handleStateUpdate(e) {
        const { path, value, type } = e.detail;

        if (path[0] === 'pinnedCategories') {
            this.renderAll();
            return;
        }

        if (path[0] !== 'wildcards') {
            return;
        }

        if (path.length === 1 && path[0] === 'wildcards') {
            this.renderAll();
            return;
        }

        const wildcardsPath = path.slice(1);

        if (wildcardsPath.length === 0) {
            this.renderAll();
            return;
        }

        const relevantKey = wildcardsPath[0];
        const stringPath = wildcardsPath.join('/');

        // CASE 1: Top-level category added/removed
        if (wildcardsPath.length === 1) {
            const key = wildcardsPath[0];
            const fullPath = key;

            if (type === 'delete' || value === undefined) {
                const el = this.elements.container.querySelector(`details[data-path="${fullPath}"]`);
                if (el) el.remove();
            } else {
                const existing = this.elements.container.querySelector(`details[data-path="${fullPath}"]`);
                const allKeys = Object.keys(State.state.wildcards || {}).sort((a, b) => a.localeCompare(b));
                const index = allKeys.indexOf(key);

                if (existing) {
                    const newEl = Category.create(key, value, 0, fullPath, index, this.sortKeys.bind(this));
                    if (existing.hasAttribute('open')) {
                        newEl.setAttribute('open', '');
                    }
                    existing.replaceWith(newEl);
                } else {
                    const newEl = Category.create(key, value, 0, fullPath, index, this.sortKeys.bind(this));
                    let inserted = false;
                    const children = this.elements.container.children;
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (child.classList.contains('category-item')) {
                            const childPath = child.dataset.path;
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
        const parentPath = wildcardsPath.slice(0, -1).join('/');
        const changedProp = wildcardsPath[wildcardsPath.length - 1];

        if (wildcardsPath.includes('wildcards')) {
            let cardPathArr = [];
            for (let i = 0; i < wildcardsPath.length; i++) {
                if (wildcardsPath[i] === 'wildcards') break;
                cardPathArr.push(wildcardsPath[i]);
            }
            const cardPath = cardPathArr.join('/');

            const cardEl = this.findCardElement(cardPath);
            if (cardEl) {
                const data = State.getObjectByPath(cardPath);
                this.updateCardContent(cardEl, data, cardPath);
            }
            this.updateStats();
            return;
        }

        const parentEl = this.findElement(parentPath);
        if (parentEl && parentEl.tagName === 'DETAILS') {
            const data = State.getObjectByPath(parentPath);
            if (data) {
                const level = parseInt(parentEl.classList.value.match(/level-(\d+)/)?.[1] || '0');
                // Use Category renderContent
                Category.renderContent(parentEl, data, parentPath, level, this.sortKeys.bind(this));
                this.updateStats();
                return;
            }
        }

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

    handleStatePatch(changes) {
        console.log('[UI] State patch received:', changes.length, 'changes');

        let needsStatsUpdate = false;

        for (const change of changes) {
            const { path, type, value } = change;

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
                this.renderAll();
                return;
            }

            if (path[0] === 'wildcards') {
                needsStatsUpdate = true;
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

    findCardElement(path) {
        return document.querySelector(`div[data-path="${path}"]`);
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
                if (Config[p.apiUrlId] || Config.API_URL_CUSTOM) {
                    urlSection.querySelector('input').value = Config[p.apiUrlId] || Config.API_URL_CUSTOM;
                }
            }

            const apiKeyInput = clone.querySelector('.api-key-input');
            apiKeyInput.id = p.apiKeyId;
            apiKeyInput.placeholder = p.apiKeyPlaceholder;

            const configKey = `API_KEY_${p.id.toUpperCase()}`;
            if (Config[configKey]) {
                apiKeyInput.value = Config[configKey];
            }

            const apiKeyLabel = apiKeyInput.closest('div').previousElementSibling;
            if (apiKeyLabel && apiKeyLabel.tagName === 'LABEL') {
                apiKeyLabel.htmlFor = p.apiKeyId;
            }

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

            const rememberCheckbox = clone.querySelector('.api-key-remember');
            if (localStorage.getItem(`wildcards_api_key_${p.id}`)) {
                rememberCheckbox.checked = true;
            }

            const handleSaveKey = () => {
                const key = apiKeyInput.value.trim();
                const persist = rememberCheckbox.checked;
                saveApiKey(p.id, key, persist);
            };

            apiKeyInput.addEventListener('input', handleSaveKey);
            apiKeyInput.addEventListener('change', handleSaveKey);
            rememberCheckbox.addEventListener('change', handleSaveKey);

            const modelInputWrapper = document.createElement('div');
            modelInputWrapper.className = 'relative w-full';

            const modelInput = clone.querySelector('.model-name-input');
            modelInput.id = p.modelNameId;
            modelInput.setAttribute('list', p.modelListId);
            modelInput.placeholder = p.modelPlaceholder;
            modelInput.classList.add('pr-8');

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'model-clear-btn absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white hidden';
            clearBtn.innerHTML = '✕';
            clearBtn.ariaLabel = 'Clear model name';

            const updateClearBtn = () => {
                if (modelInput.value) clearBtn.classList.remove('hidden');
                else clearBtn.classList.add('hidden');
            };

            modelInput.addEventListener('input', updateClearBtn);

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

            setTimeout(updateClearBtn, 100);

            clearBtn.addEventListener('click', () => {
                modelInput.value = '';
                updateClearBtn();
                modelInput.focus();
                modelInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            modelInput.parentNode.insertBefore(modelInputWrapper, modelInput);
            modelInputWrapper.appendChild(modelInput);
            modelInputWrapper.appendChild(clearBtn);

            const wrapperContainer = modelInputWrapper.parentNode;
            const modelLabel = wrapperContainer.previousSibling;
            // @ts-ignore
            if (modelLabel && modelLabel.tagName === 'LABEL') {
                // @ts-ignore
                modelLabel.htmlFor = p.modelNameId;
            }

            if (p.extraOptions) {
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-models-btn p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors ml-1';
                refreshBtn.innerHTML = '<span aria-hidden="true">🔄</span>';
                refreshBtn.setAttribute('aria-label', 'Refresh Model List');
                refreshBtn.title = 'Refresh Model List';
                refreshBtn.dataset.provider = p.id;

                const containerDiv = document.createElement('div');
                containerDiv.className = 'flex items-center w-full';
                modelInputWrapper.parentNode.replaceChild(containerDiv, modelInputWrapper);
                containerDiv.appendChild(modelInputWrapper);
                containerDiv.appendChild(refreshBtn);

                const filtersDiv = document.createElement('div');
                filtersDiv.className = 'flex flex-wrap gap-4 mt-2 text-sm text-gray-300';

                const freeLabel = document.createElement('label');
                freeLabel.className = 'flex items-center gap-2 cursor-pointer';
                freeLabel.innerHTML = `<input type="checkbox" id="${p.id}-free-only" class="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500"> <span>Free Models Only</span>`;

                const jsonLabel = document.createElement('label');
                jsonLabel.className = 'flex items-center gap-2 cursor-pointer';
                jsonLabel.innerHTML = `<input type="checkbox" id="${p.id}-json-only" class="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500" checked> <span>Require JSON Support</span>`;

                filtersDiv.appendChild(freeLabel);
                filtersDiv.appendChild(jsonLabel);

                containerDiv.parentNode.insertBefore(filtersDiv, containerDiv.nextSibling);

                refreshBtn.addEventListener('click', (e) => {
                    /** @type {HTMLButtonElement} */
                    const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
                    btn.classList.add('animate-spin');
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

            if (p.showTip) {
                const tipBox = clone.querySelector('.tip-box');
                tipBox.classList.remove('hidden');
                tipBox.querySelector('.tip-text').textContent = p.tipText;
            }

            const settingsInputs = clone.querySelectorAll('[data-setting]');
            settingsInputs.forEach(input => {
                const settingKey = input.dataset.setting;
                const displayEl = clone.querySelector(`[data-for="setting-${settingKey.replace('MODEL_', '').toLowerCase().replace(/_/g, '-')}"]`);

                if (Config[settingKey] !== undefined) {
                    input.value = Config[settingKey];
                    if (displayEl) displayEl.textContent = Config[settingKey];
                }

                input.addEventListener('input', (e) => {
                    const val = (input.type === 'number' || input.type === 'range') ? parseFloat(e.target.value) : e.target.value;
                    Config[settingKey] = val;
                    saveConfig();

                    if (displayEl) displayEl.textContent = val;
                });
            });

            container.appendChild(clone);
        });

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

    toggleLoader(path, isLoading, streamText = null) {
        const card = this.findCardElement(path);
        if (!card) return;

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
                const startTime = Date.now();
                text.textContent = '0.0s...';
                // @ts-ignore
                btn._timerInterval = setInterval(() => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    if (streamText) {
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
            // @ts-ignore
            if (btn._timerInterval) {
                // @ts-ignore
                clearInterval(btn._timerInterval);
                // @ts-ignore
                btn._timerInterval = null;
            }
        }
    },

    focusPath(path) {
        if (!path) {
            this.elements.breadcrumbs.classList.add('hidden');
            this.elements.container.classList.remove('focus-mode');
            this.elements.container.querySelectorAll('.category-item').forEach(el => el.classList.remove('hidden'));
            return;
        }

        const rootKey = path.split('/')[0];
        this.elements.container.querySelectorAll('.category-item.level-0').forEach(el => {
            if (el.dataset.path !== rootKey) el.classList.add('hidden');
            else el.classList.remove('hidden');
        });

        this.renderBreadcrumbs(path);
        this.elements.breadcrumbs.classList.remove('hidden');

        const parts = path.split('/');
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += (index > 0 ? '/' : '') + part;
            const el = this.elements.container.querySelector(`[data-path="${currentPath}"]`);
            if (el && el.tagName === 'DETAILS') {
                el.open = true;
            }
        });

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
            const name = part.replace(/_/g, ' ');
            html += `<span class="breadcrumb-separator">/</span>`;
            if (index === parts.length - 1) {
                html += `<span class="breadcrumb-item text-indigo-400 font-bold" data-path="${currentPath}">${sanitize(name)}</span>`;
            } else {
                html += `<span class="breadcrumb-item" data-path="${currentPath}">${sanitize(name)}</span>`;
            }
        });

        this.elements.breadcrumbs.innerHTML = html;

        this.elements.breadcrumbs.querySelectorAll('.breadcrumb-item').forEach(el => {
            el.onclick = () => {
                const targetPath = el.dataset.path;
                const event = new CustomEvent('request-focus-path', { detail: { path: targetPath } });
                document.dispatchEvent(event);
            };
        });
    },

    updateCardContent(element, data, path) {
        const countSpan = element.querySelector('.wildcard-count');
        if (countSpan) countSpan.textContent = `(${(data.wildcards || []).length})`;

        const chipContainer = element.querySelector('.chip-container');
        if (chipContainer) {
            const wildcards = data.wildcards || [];
            chipContainer.innerHTML = wildcards.length > 0
                ? wildcards.map((wc, i) => Chip(wc, i)).join('')
                : WildcardCard.getEmptyListHtml();
        }
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
        if (this.elements.statsBar) {
            this.elements.statsBar.querySelector('#stat-categories').textContent = categoryCount;
            this.elements.statsBar.querySelector('#stat-wildcards').textContent = wildcardCount.toLocaleString();
            this.elements.statsBar.querySelector('#stat-pinned').textContent = (State.state.pinnedCategories || []).length;
        }
    },

    showNotification(message, isConfirmation = false, onConfirm = null, withInput = false, customButtons = null) {
        Modal.showNotification(this.elements.dialog, message, isConfirmation, onConfirm, withInput, customButtons);
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

        const openDialog = document.querySelector('dialog[open]');
        if (openDialog) {
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
        if (provider !== 'openrouter') return;

        State.state.availableModels = models;
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
            if (freeOnly) {
                const pricing = m.pricing;
                const isFree = pricing &&
                    (parseFloat(pricing.prompt) === 0) &&
                    (parseFloat(pricing.completion) === 0);
                if (!isFree) return false;
            }

            if (jsonOnly) {
                const supportsJson = m.supported_parameters && m.supported_parameters.includes('response_format');
                if (!supportsJson) return false;
            }
            return true;
        });

        filtered.sort((a, b) => a.id.localeCompare(b.id));

        filtered.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            datalist.appendChild(option);
        });

        const loadingInd = document.getElementById(`${provider}-model-loading-indicator`);
        if (loadingInd) {
            loadingInd.textContent = `${filtered.length} models available`;
            loadingInd.classList.remove('hidden', 'animate-pulse');
            loadingInd.classList.add('text-green-400');
        }
    },

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
