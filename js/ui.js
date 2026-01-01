import { State } from './state.js';
import { sanitize } from './utils.js';
import { Config } from './config.js';

export const UI = {
    elements: {},

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
            searchResultsCount: document.getElementById('search-results-count'),
        };

        // Settings Modal Handlers
        this.elements.settingsBtn?.addEventListener('click', () => {
            this.elements.settingsDialog?.showModal();
        });
        this.elements.settingsCloseBtn?.addEventListener('click', () => {
            this.elements.settingsDialog?.close();
        });
        this.elements.settingsDialog?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsDialog) {
                this.elements.settingsDialog.close();
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
        State.events.addEventListener('notification', (e) => this.showNotification(e.detail));

        // Listen for new custom events for focus/navigation
        document.addEventListener('request-focus-path', (e) => this.focusPath(e.detail.path));

        // Prompt change handlers
        document.getElementById('global-prompt')?.addEventListener('input', (e) => {
            State.state.systemPrompt = e.target.value;
        });
        document.getElementById('suggestion-prompt')?.addEventListener('input', (e) => {
            State.state.suggestItemPrompt = e.target.value;
        });

        // API endpoint change handler
        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = e.target.value;
            Config.API_ENDPOINT = provider;
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
            return a.localeCompare(b);
        });
    },

    renderAll() {
        const wildcards = State.state.wildcards;

        // Populate prompts from State
        const globalPrompt = document.getElementById('global-prompt');
        const suggestionPrompt = document.getElementById('suggestion-prompt');
        const apiEndpoint = document.getElementById('api-endpoint');

        if (globalPrompt) {
            globalPrompt.value = State.state.systemPrompt || Config.DEFAULT_SYSTEM_PROMPT || '';
        }
        if (suggestionPrompt) {
            suggestionPrompt.value = State.state.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT || '';
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

        const wildcardsPath = path.slice(1); // Remove 'wildcards' prefix
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
                if (input && input.value !== value) input.value = value || '';
            }
        }

        this.updateStats();
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
            }

            // API Key
            const apiKeyInput = clone.querySelector('.api-key-input');
            apiKeyInput.id = p.apiKeyId;
            apiKeyInput.placeholder = p.apiKeyPlaceholder;

            if (p.apiKeyOptional) {
                clone.querySelector('.optional-text').classList.remove('hidden');
            }

            if (p.showKeyHelp) {
                clone.querySelector('.key-help-text').classList.remove('hidden');
            }

            // Check Persistence state
            if (localStorage.getItem(`wildcards_api_key_${p.id}`)) {
                clone.querySelector('.api-key-remember').checked = true;
            }

            // Model Name
            const modelInput = clone.querySelector('.model-name-input');
            modelInput.id = p.modelNameId;
            modelInput.setAttribute('list', p.modelListId);
            modelInput.placeholder = p.modelPlaceholder;

            // Extra Options (Filters & Refresh)
            if (p.extraOptions) {
                // Refresh Button
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-models-btn p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors ml-1';
                refreshBtn.innerHTML = '🔄';
                refreshBtn.title = 'Refresh Model List';
                refreshBtn.dataset.provider = p.id;
                modelInput.parentNode.appendChild(refreshBtn);

                // Checkboxes Container
                const filtersDiv = document.createElement('div');
                filtersDiv.className = 'flex flex-wrap gap-4 mt-2 text-sm text-gray-300';

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
                modelInput.closest('div').parentNode.insertBefore(filtersDiv, modelInput.closest('div').nextSibling);
            }

            const datalist = clone.querySelector('.model-list');
            datalist.id = p.modelListId;

            const testBtn = clone.querySelector('.test-conn-btn');
            testBtn.dataset.provider = p.id;

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

    findCardElement(path) {
        // Can be a details (if it's a category) or a div (if it's a wildcard list)
        // Actually wildcard lists are div.bg-gray-700
        return document.querySelector(`div[data-path="${path}"]`);
    },

    toggleLoader(path, isLoading) {
        const card = this.findCardElement(path);
        if (!card) return;

        // Find the generate button specifically
        const btn = card.querySelector('.generate-btn');
        if (!btn) return;

        const loader = btn.querySelector('.loader');
        const text = btn.querySelector('.btn-text');

        if (isLoading) {
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-not-allowed');
            if (loader) loader.classList.remove('hidden');
            if (text) text.classList.add('hidden');
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
            if (loader) loader.classList.add('hidden');
            if (text) text.classList.remove('hidden');
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
        element.className = `bg-gray-800 rounded-lg shadow-md group level-${level} category-item`; // added category-item
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
        element.className = `bg-gray-700/50 p-4 rounded-lg flex flex-col level-${level} wildcard-card`; // added wildcard-card
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
            chipContainer.innerHTML = (data.wildcards || []).map((wc, i) => this.createChip(wc, i)).join('');
        }
    },

    getCategoryFolderHtml(name, data, path) {
        const isPinned = State.state.pinnedCategories && State.state.pinnedCategories.includes(path); // Use State.state
        return `
            <summary class="flex justify-between items-center p-4 cursor-pointer gap-4 group">
                <div class="flex items-center gap-3 flex-wrap flex-grow">
                    <input type="checkbox" class="category-batch-checkbox w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500" onclick="event.stopPropagation();">
                    <h2 class="text-xl font-semibold text-indigo-400 select-none"><span contenteditable="true" class="category-name outline-none focus:bg-indigo-400/50 rounded px-1" aria-label="Edit category name">${name.replace(/_/g, ' ')}</span></h2>
                    <input type="text" class="custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 flex-grow transition-all duration-200" placeholder="Folder instructions..." style="min-width: 200px;" value="${sanitize(data.instruction || '')}" onclick="event.stopPropagation();">
                </div>
                <div class="flex items-center gap-2 ml-auto flex-shrink-0">
                    <button class="pin-btn btn-action-icon text-yellow-400 hover:text-yellow-300 text-lg transition-all duration-200" title="${isPinned ? 'Unpin' : 'Pin to top'}">${isPinned ? '📌' : '📍'}</button>
                    <button class="delete-btn btn-action-icon text-red-400 hover:text-red-300 font-bold text-xl leading-none transition-all duration-200" title="Delete this category">&times;</button>
                    <span class="arrow-down transition-transform duration-300 text-indigo-400"><svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                </div>
            </summary>
            <div class="content-wrapper p-4 border-t border-gray-700 flex flex-col gap-4"></div>
        `;
    },

    getWildcardCardHtml(name, data, path) {
        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')).replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top Level';
        return `
            <div class="text-xs text-gray-400 mb-1 uppercase tracking-wider">${sanitize(parentPath)}</div>
            <div class="flex justify-between items-center mb-2 group">
                <h3 class="font-bold text-lg text-gray-100 flex-grow"><span contenteditable="true" class="wildcard-name outline-none focus:bg-indigo-400/50 rounded px-1" aria-label="Edit list name">${name.replace(/_/g, ' ')}</span> <span class="wildcard-count text-gray-400 text-sm ml-2">(${(data.wildcards || []).length})</span></h3>
                <button class="delete-btn btn-action-icon text-red-400 hover:text-red-300 font-bold text-xl leading-none transition-all duration-200" title="Delete this card">&times;</button>
            </div>
            <input type="text" class="custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 w-full my-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200" placeholder="Custom generation instructions..." value="${sanitize(data.instruction || '')}">
            <div class="chip-container custom-scrollbar flex flex-wrap gap-2 bg-gray-800 rounded-md p-2 w-full border border-gray-600 overflow-y-auto" style="max-height: 150px; min-height: 2.5rem;">
                ${(data.wildcards || []).map((wc, i) => this.createChip(wc, i)).join('')}
            </div>
            <div class="flex gap-2 mt-2">
                <input type="text" placeholder="Add new wildcard..." class="add-wildcard-input flex-grow bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-sm">
                <button class="add-wildcard-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-md">+
                </button>
            </div>
            <div class="flex justify-between items-center mt-3 flex-wrap gap-2">
                <button class="generate-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center gap-2 shadow-sm hover:shadow-md transition-all"><span class="btn-text">Generate More</span><div class="loader hidden"></div></button>
                <div class="flex gap-1 ml-auto">
                    <button class="copy-btn btn-secondary text-gray-400 hover:text-white p-2 rounded-md transition-colors" title="Copy all wildcards"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="select-all-btn btn-secondary text-xs py-1.5 px-2 rounded-md" title="Select All">Select All</button>
                    <button class="batch-delete-btn bg-red-900/50 hover:bg-red-700 text-red-200 hover:text-white text-xs py-1.5 px-2 rounded-md transition-colors" title="Delete Selected">Delete</button>
                </div>
            </div>
        `;
    },

    createChip(wildcard, index) {
        return `<div class="chip bg-indigo-500/50 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap" data-index="${index}"><input type="checkbox" class="batch-select bg-gray-700 border-gray-500 text-indigo-600 focus:ring-indigo-500"><span contenteditable="true" class="outline-none focus:bg-indigo-400/50 rounded px-1" aria-label="Edit item">${sanitize(wildcard)}</span></div>`;
    },

    createPlaceholderCategory() {
        const div = document.createElement('div');
        div.className = 'placeholder-category bg-gray-800 rounded-lg shadow-md mt-4';
        div.innerHTML = `
            <div class="p-4 flex flex-wrap justify-between items-center gap-4">
                <h2 class="text-xl sm:text-2xl font-semibold text-indigo-400">Add New Top-Level Category</h2>
                <div class="flex items-center gap-2">
                    <button id="add-category-placeholder-btn" class="add-category-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md">+</button>
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
                <button class="add-subcategory-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md">+</button>
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
                    <button class="add-wildcard-list-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-2xl">+</button>
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
            setTimeout(() => inputElement.focus(), 100);
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

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.elements.toastContainer.appendChild(toast);
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

        const freeOnly = document.getElementById(`${provider}-free-only`)?.checked;
        const jsonOnly = document.getElementById(`${provider}-json-only`)?.checked;

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
        // Let's sort alphabetically by name
        filtered.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        filtered.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            // Label format: "Name (Free?)" or just Name
            const isFree = m.pricing && parseFloat(m.pricing.prompt) === 0;
            const label = `${m.name || m.id}${isFree ? ' [FREE]' : ''}`;
            option.textContent = label; // In some browsers this shows in the list
            datalist.appendChild(option);
        });

        // Update count helper?
        const loadingInd = document.getElementById(`${provider}-model-loading-indicator`);
        if (loadingInd) {
            loadingInd.textContent = `${filtered.length} models available`;
            loadingInd.classList.remove('hidden', 'animate-pulse');
            loadingInd.classList.add('text-green-400');
        }
    }
};
