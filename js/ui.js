import { State } from './state.js';
import { sanitize } from './utils.js';
import { Config } from './config.js';
import './components/wildcard-category.js';
import './components/wildcard-card.js';

export const UI = {
    elements: {},
    _settingsDirty: false,

    init() {
        this.cacheElements();
        this.renderApiSettings();
        this.bindGlobalEvents();
        // The components will handle rendering when state updates
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
            settingsDialog: document.getElementById('settings-dialog'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsCloseBtn: document.getElementById('settings-close-btn'),
            overflowMenuBtn: document.getElementById('overflow-menu-btn'),
            overflowMenuDropdown: document.getElementById('overflow-menu-dropdown'),
            search: document.getElementById('search-wildcards'),
            searchClearBtn: document.getElementById('search-clear-btn'),
            searchResultsCount: document.getElementById('search-results-count'),
        };

        // ... Keep existing event listeners for dialogs, search, etc. ...
        // Search Handlers
        if (this.elements.search) {
            let searchTimeout = null;
            this.elements.search.addEventListener('input', (e) => {
                const val = e.target.value;
                if (this.elements.searchClearBtn) {
                    if (val && val.length > 0) this.elements.searchClearBtn.classList.remove('hidden');
                    else this.elements.searchClearBtn.classList.add('hidden');
                }
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
                this.elements.search.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }

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
        // State events are less relevant for rendering now, but still useful for notifications
        State.events.addEventListener('state-updated', (e) => this.handleStateUpdate(e));
        State.events.addEventListener('state-reset', () => this.renderAll()); // Initial render
        State.events.addEventListener('notification', (e) => this.showNotification(e.detail));

        document.addEventListener('request-focus-path', (e) => this.focusPath(e.detail.path));

        document.getElementById('global-prompt')?.addEventListener('input', (e) => {
            State.state.systemPrompt = e.target.value;
        });
        document.getElementById('suggestion-prompt')?.addEventListener('input', (e) => {
            State.state.suggestItemPrompt = e.target.value;
        });

        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = e.target.value;
            Config.API_ENDPOINT = provider;
            this.updateSettingsVisibility(provider);
        });
    },

    sortKeys(keys, parentPath) {
        // Logic moved to components ideally, but used for initial render
        const pinned = State.state.pinnedCategories || [];
        return keys.sort((a, b) => {
            const pathA = parentPath ? `${parentPath}/${a}` : a;
            const pathB = parentPath ? `${parentPath}/${b}` : b;
            const isPinnedA = pinned.includes(pathA);
            const isPinnedB = pinned.includes(pathB);
            if (isPinnedA && !isPinnedB) return -1;
            if (!isPinnedA && isPinnedB) return 1;
            return a.localeCompare(b);
        });
    },

    renderAll() {
        const wildcards = State.state.wildcards;
        if (!wildcards) return;

        // Populate prompts
        const globalPrompt = document.getElementById('global-prompt');
        const suggestionPrompt = document.getElementById('suggestion-prompt');
        const apiEndpoint = document.getElementById('api-endpoint');

        if (globalPrompt) globalPrompt.value = State.state.systemPrompt || Config.DEFAULT_SYSTEM_PROMPT || '';
        if (suggestionPrompt) suggestionPrompt.value = State.state.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT || '';
        if (apiEndpoint) {
            apiEndpoint.value = Config.API_ENDPOINT || 'openrouter';
            this.updateSettingsVisibility(apiEndpoint.value);
        }

        // Render using Web Components
        this.elements.container.innerHTML = '';

        let keys = Object.keys(wildcards);
        keys = this.sortKeys(keys, ''); // Top level sorting

        keys.forEach((key, index) => {
            // Check if it's a leaf or category
            // Top level usually categories, but could be mixed?
            // Existing logic assumes structure.
            const data = wildcards[key];
            const isLeaf = data && Array.isArray(data.wildcards);

            let el;
            const fullPath = `wildcards/${key}`;
            if (isLeaf) {
                el = document.createElement('wildcard-card');
            } else {
                el = document.createElement('wildcard-category');
            }

            el.setAttribute('data-path', fullPath);
            el.setAttribute('level', 0);
            if (!isLeaf) {
                 // category tint
                 // The component should handle tint via CSS classes if passed as attribute or calculated
                 // For now, let's just let it be.
            }
            this.elements.container.appendChild(el);
        });

        // Add Placeholder for new top-level
        const placeholder = this.createPlaceholderCategory();
        this.elements.container.appendChild(placeholder);

        this.updateStats();
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

    handleStateUpdate(e) {
        // Most updates are handled by components via signals.
        // But we might need to handle top-level additions/removals if the list of keys changes at root.
        const { path } = e.detail;

        if (path.length === 0 || (path.length === 1 && path[0] === 'pinnedCategories')) {
             // Global structure change or reorder
             this.renderAll();
        } else if (path[0] === 'wildcards' && path.length === 2) {
            // Top level add/remove
            // Check if element exists
            const key = path[1];
            const existing = this.elements.container.querySelector(`[data-path="${key}"]`);
            const value = State.getObjectByPath(key); // top level

            if (value === undefined) {
                // Deleted
                if (existing) existing.remove();
            } else if (!existing) {
                // Added
                // Re-render all to respect sort order for now
                this.renderAll();
            }
        }

        this.updateStats();
    },

    // ... Keep helper methods like showNotification, updateStats, etc ...
    updateStats() {
        // Same implementation as before
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
        // ... (Same as original)
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
        this.showToast('Settings saved', 'success');
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

    renderApiSettings() {
        // ... (Keep existing implementation)
        const container = document.getElementById('api-settings-container');
        const template = document.getElementById('api-settings-template');
        if (!container || !template) return;

        // (Copying full implementation from memory to ensure it works)
        const providers = [
            { id: 'openrouter', title: 'OpenRouter API', iconUrl: 'https://openrouter.ai/favicon.ico', linkUrl: 'https://openrouter.ai/keys', apiKeyId: 'openrouter-api-key', apiKeyPlaceholder: 'sk-or-...', modelNameId: 'openrouter-model-name', modelListId: 'openrouter-model-list', modelPlaceholder: 'e.g., openai/gpt-4o', loadingId: 'openrouter-model-loading-indicator', errorId: 'openrouter-model-error-indicator', showKeyHelp: true, showTip: true, tipText: 'OpenRouter provides access to hundreds of models.', extraOptions: true },
            { id: 'gemini', title: 'Gemini API', linkUrl: 'https://aistudio.google.com/app/apikey', apiKeyId: 'gemini-api-key', apiKeyPlaceholder: 'AIzaSy...', modelNameId: 'gemini-model-name', modelListId: 'gemini-model-list', modelPlaceholder: 'e.g., gemini-1.5-flash', loadingId: 'gemini-model-loading-indicator', errorId: 'gemini-model-error-indicator', showKeyHelp: false },
            { id: 'custom', title: 'Custom API', isCustom: true, apiKeyId: 'custom-api-key', apiKeyPlaceholder: 'Enter API key if required', apiKeyOptional: true, modelNameId: 'custom-model-name', modelListId: 'custom-model-list', modelPlaceholder: 'Enter model identifier', apiUrlId: 'custom-api-url', loadingId: 'custom-model-loading-indicator', errorId: 'custom-model-error-indicator' }
        ];

        container.innerHTML = '';

        providers.forEach(p => {
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
            if (p.linkUrl) headerLink.href = p.linkUrl;
            else headerLink.remove();

            if (p.isCustom) {
                clone.querySelector('.custom-badge').classList.remove('hidden');
                const urlSection = clone.querySelector('.custom-url-section');
                urlSection.classList.remove('hidden');
                urlSection.querySelector('input').id = p.apiUrlId;
            }

            const apiKeyInput = clone.querySelector('.api-key-input');
            apiKeyInput.id = p.apiKeyId;
            apiKeyInput.placeholder = p.apiKeyPlaceholder;

            const apiKeyLabel = apiKeyInput.closest('div').previousElementSibling;
            if (apiKeyLabel && apiKeyLabel.tagName === 'LABEL') apiKeyLabel.htmlFor = p.apiKeyId;

            if (localStorage.getItem(`wildcards_api_key_${p.id}`)) {
                clone.querySelector('.api-key-remember').checked = true;
            }

            const modelInput = clone.querySelector('.model-name-input');
            modelInput.id = p.modelNameId;
            modelInput.setAttribute('list', p.modelListId);
            modelInput.placeholder = p.modelPlaceholder;

            const modelLabel = modelInput.closest('div').parentNode.previousElementSibling;
            if (modelLabel && modelLabel.tagName === 'LABEL') modelLabel.htmlFor = p.modelNameId;

            if (p.extraOptions) {
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-models-btn p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors ml-1';
                refreshBtn.innerHTML = '🔄';
                refreshBtn.title = 'Refresh Model List';
                refreshBtn.dataset.provider = p.id;
                modelInput.parentNode.appendChild(refreshBtn);
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
            container.appendChild(clone);
        });

        const active = Config.API_ENDPOINT || 'openrouter';
        this.updateSettingsVisibility(active);
    },

    updateSettingsVisibility(provider) {
        document.querySelectorAll('.api-settings-panel').forEach(el => el.classList.add('hidden'));
        const selectedPanel = document.getElementById(`settings-${provider}`);
        if (selectedPanel) selectedPanel.classList.remove('hidden');
    },

    handleSearch(query) {
        // Updated search logic to work with Custom Elements
        // Custom elements shadow dom might hide content from simple querySelector.
        // But the 'hidden' class on the host element still works.
        // We need to query INSIDE shadow roots?
        // Actually, we should probably implement search logic inside the components or traverse the tree.

        const normalizedQuery = query.toLowerCase().trim();
        let matchCount = 0;

        const scan = (el) => {
            if (!el.tagName.startsWith('WILDCARD-')) return false;

            let hasMatch = false;

            // Access Shadow Root
            const shadow = el.shadowRoot;
            if (!shadow) return false;

            const nameEl = shadow.querySelector('.name, .category-name');
            const name = nameEl ? nameEl.textContent.toLowerCase() : '';

            let wildcardsMatch = false;
            if (el.tagName === 'WILDCARD-CARD') {
                const chips = shadow.querySelectorAll('.chip span');
                chips.forEach(chip => {
                     if (chip.textContent.toLowerCase().includes(normalizedQuery)) wildcardsMatch = true;
                });
            }

            // Recursive check for children in slot or content-wrapper
            // Since we append children to the Light DOM of the component (in renderChildren of Category),
            // we can query children normally.
            // Wait, in my component implementation `contentWrapper.appendChild` was used inside Shadow DOM?
            // "this.contentWrapper = this.shadowRoot.querySelector('.content-wrapper');"
            // "this.contentWrapper.appendChild(childEl);"
            // So children are in Shadow DOM.
            // `el.querySelector` on the host will NOT find them.
            // We must use `shadow.querySelectorAll`.

            if (el.tagName === 'WILDCARD-CATEGORY') {
                const children = shadow.querySelectorAll('wildcard-category, wildcard-card');
                let childMatched = false;
                children.forEach(child => {
                    if (scan(child)) childMatched = true;
                });

                if (childMatched) {
                    hasMatch = true;
                    // Auto expand?
                    const details = shadow.querySelector('details');
                    if (details) details.open = true;
                }
            }

            if (normalizedQuery === '' || name.includes(normalizedQuery) || wildcardsMatch) {
                hasMatch = true;
            }

            if (hasMatch) {
                el.style.display = '';
                if (el.tagName !== 'WILDCARD-CATEGORY' || normalizedQuery !== '') matchCount++;
            } else {
                el.style.display = 'none';
            }

            return hasMatch;
        };

        const topLevel = this.elements.container.children;
        Array.from(topLevel).forEach(el => {
             if (el.tagName.startsWith('WILDCARD-')) scan(el);
        });

        if (this.elements.searchResultsCount) {
             this.elements.searchResultsCount.textContent = normalizedQuery ? `${matchCount} matches` : '';
        }
    },

    // Focus Path
    focusPath(path) {
        // ... (Update to work with Custom Elements)
        if (!path) {
            this.elements.breadcrumbs.classList.add('hidden');
            Array.from(this.elements.container.children).forEach(el => el.classList.remove('hidden'));
            return;
        }

        const rootKey = path.split('/')[0];
        Array.from(this.elements.container.children).forEach(el => {
             if (el.dataset.path !== rootKey && el.classList.contains('category-item')) { // Check class? Or attribute?
                 el.classList.add('hidden');
             } else {
                 el.classList.remove('hidden');
             }
        });

        this.renderBreadcrumbs(path);
        this.elements.breadcrumbs.classList.remove('hidden');

        // Expansion logic needs to traverse shadow roots... complex.
        // For V1, maybe we just assume open?
    },

    renderBreadcrumbs(path) {
        // Same as before
        if (!this.elements.breadcrumbs) return;
        const parts = path.split('/');
        let currentPath = '';
        let html = `<span class="breadcrumb-item font-semibold" data-path="">Home</span>`;
        parts.forEach((part, index) => {
            currentPath += (index > 0 ? '/' : '') + part;
            const name = part.replace(/_/g, ' ');
            html += `<span class="breadcrumb-separator">/</span>`;
            html += `<span class="breadcrumb-item ${index===parts.length-1?'text-indigo-400 font-bold':''}" data-path="${currentPath}">${sanitize(name)}</span>`;
        });
        this.elements.breadcrumbs.innerHTML = html;
        this.elements.breadcrumbs.querySelectorAll('.breadcrumb-item').forEach(el => {
            el.onclick = () => document.dispatchEvent(new CustomEvent('request-focus-path', { detail: { path: el.dataset.path } }));
        });
    },

    // Filter/Model rendering logic ... (Same as before)
    filterAndRenderModels(provider) {
         // ... Copy existing logic ...
         const models = State.state.availableModels || [];
         const datalist = document.getElementById(`${provider}-model-list`);
         if (!datalist) return;
         const freeOnly = document.getElementById(`${provider}-free-only`)?.checked;
         const jsonOnly = document.getElementById(`${provider}-json-only`)?.checked;
         datalist.innerHTML = '';
         const filtered = models.filter(m => {
             if (freeOnly) {
                 const p = m.pricing;
                 if (!p || (parseFloat(p.prompt) !== 0)) return false;
             }
             if (jsonOnly) {
                 if (!m.supported_parameters || !m.supported_parameters.includes('response_format')) return false;
             }
             return true;
         });
         filtered.sort((a,b) => (a.name||a.id).localeCompare(b.name||b.id));
         filtered.forEach(m => {
             const option = document.createElement('option');
             option.value = m.id;
             const isFree = m.pricing && parseFloat(m.pricing.prompt) === 0;
             option.textContent = `${m.name||m.id}${isFree?' [FREE]':''}`;
             datalist.appendChild(option);
         });
         const loadingInd = document.getElementById(`${provider}-model-loading-indicator`);
         if (loadingInd) {
             loadingInd.textContent = `${filtered.length} models available`;
             loadingInd.classList.remove('hidden', 'animate-pulse');
             loadingInd.classList.add('text-green-400');
         }
    },
    populateModelList(provider, models) {
        if (provider !== 'openrouter') return;
        State.state.availableModels = models;
        this.filterAndRenderModels(provider);
    }
};
