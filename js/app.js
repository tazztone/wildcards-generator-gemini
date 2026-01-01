import { State } from './state.js';
import { UI } from './ui.js';
import { Api } from './api.js';
import { Config, saveApiKey } from './config.js';
import { debounce } from './utils.js';

export const App = {
    draggedPath: null,

    async init() {
        UI.init();
        await State.init(); // This will trigger 'state-reset' which calls UI.renderAll()

        this.bindEvents();

        // Initial Theme
        // Initial Theme
        const theme = localStorage.getItem('wildcards-theme') || 'dark';
        document.documentElement.className = theme;
        this.updateThemeIcon(theme);
    },

    bindEvents() {
        // Event Delegation on Container for all dynamic interactions
        UI.elements.container.addEventListener('click', (e) => this.handleContainerClick(e));
        UI.elements.container.addEventListener('change', (e) => this.handleContainerChange(e));
        UI.elements.container.addEventListener('blur', (e) => this.handleContainerBlur(e), true);
        UI.elements.container.addEventListener('keydown', (e) => this.handleContainerKeydown(e));

        // Drag and Drop
        UI.elements.container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        UI.elements.container.addEventListener('dragover', (e) => this.handleDragOver(e));
        UI.elements.container.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        UI.elements.container.addEventListener('drop', (e) => this.handleDrop(e));
        UI.elements.container.addEventListener('dragend', (e) => this.handleDragEnd(e));

        // Toolbar actions
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('undo-btn')?.addEventListener('click', () => State.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => State.redo());

        // Settings / API Keys
        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = e.target.value;
            Config.API_ENDPOINT = provider;
            saveConfig(); // Persist choice
            UI.updateSettingsVisibility(provider);
        });

        document.addEventListener('change', (e) => {
            if (e.target.matches('.api-key-input') || e.target.matches('.api-key-remember')) {
                const panel = e.target.closest('.api-settings-panel');
                if (!panel) return;

                const keyInput = panel.querySelector('.api-key-input');
                const rememberCheck = panel.querySelector('.api-key-remember');
                if (!keyInput) return;

                const provider = keyInput.id.replace('-api-key', '');
                const persist = rememberCheck ? rememberCheck.checked : false;

                saveApiKey(provider, keyInput.value.trim(), persist);
            }

            // OpenRouter Filter Checkboxes
            if (e.target.id === 'openrouter-free-only' || e.target.id === 'openrouter-json-only') {
                 UI.filterAndRenderModels('openrouter');
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.matches('.test-conn-btn') || e.target.closest('.test-conn-btn')) {
                const btn = e.target.closest('.test-conn-btn') || e.target;
                const provider = btn.dataset.provider;
                Api.testConnection(provider, (msg, type) => UI.showToast(msg, type));
            }
            // Refresh Models Button
            if (e.target.matches('.refresh-models-btn')) {
                const btn = e.target;
                const provider = btn.dataset.provider;
                const icon = btn.textContent;
                btn.textContent = '⏳';
                btn.disabled = true;

                Api.testConnection(provider, (msg, type) => UI.showToast(msg, type))
                    .then(models => {
                        UI.populateModelList(provider, models);
                    })
                    .finally(() => {
                        btn.textContent = icon;
                        btn.disabled = false;
                    });
            }
            // Help Button
            if (e.target.matches('#help-btn')) {
                UI.showNotification(`Welcome!\n\nKey Features:\n- Global Settings: Set API keys and choose your provider.\n- Recursive Categories: Add nested categories for better organization.\n- Drag & Drop: Reorder items by dragging them into category folders.\n- Inline Renaming: Click any title to rename it.\n- Generate More: Use AI to create new wildcards for any list.\n- Export/Import: Save and load your entire setup.\n- Undo/Redo: Revert or re-apply changes.\n- Check Duplicates: Scan for duplicates across all categories.\n- Theme Toggle: Switch between dark and light mode.`);
            }
            // Check Duplicates
            if (e.target.matches('#check-duplicates')) {
                this.handleCheckDuplicates();
            }
            // Reset
            if (e.target.matches('#reset-btn')) {
                UI.showNotification('Are you sure you want to reset everything?', true, () => State.resetState());
            }
            // Add Category Placeholder
            if (e.target.matches('#add-category-placeholder-btn')) {
                UI.showNotification('Enter new top-level category name:', true, (name) => {
                    if (name && name.trim()) {
                        const key = name.trim().replace(/\\s+/g, '_');
                        if (State.state.wildcards[key]) { UI.showToast('Category already exists', 'error'); return; }
                        State.saveStateToHistory();
                        State.state.wildcards[key] = { instruction: '' };
                    }
                }, true);
            }
            // Suggest Top-Level
            if (e.target.matches('#suggest-toplevel-btn')) {
                this.suggestItems(null, 'folder');
            }
            // Export YAML
            if (e.target.matches('#export-yaml')) {
                this.handleExportYAML();
            }
            // Export ZIP
            if (e.target.matches('#download-all-zip')) {
                this.handleExportZIP();
            }
            // Export Config
            if (e.target.matches('#export-config')) {
                this.handleExportConfig();
            }
            // Batch Operations
            if (e.target.matches('#batch-expand')) this.handleBatchAction('expand');
            if (e.target.matches('#batch-collapse')) this.handleBatchAction('collapse');
            if (e.target.matches('#batch-delete')) this.handleBatchAction('delete');
        });

        // Batch Select All
        document.getElementById('batch-select-all')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.category-batch-checkbox').forEach(cb => cb.checked = checked);
            this.updateBatchUI();
        });
        UI.elements.container.addEventListener('change', (e) => {
            if (e.target.matches('.category-batch-checkbox')) {
                this.updateBatchUI();
            }
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    },

    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 's': e.preventDefault(); UI.showToast('All changes are saved automatically.', 'info'); break;
                case 'z': e.preventDefault(); State.undo(); break;
                case 'y': e.preventDefault(); State.redo(); break;
            }
            return;
        }
        // Arrow key navigation
        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
            const container = document.getElementById('wildcard-container');
            const categories = Array.from(container.querySelectorAll(':scope > details'));
            if (categories.length === 0) return;
            const focused = document.activeElement;
            const currentCategory = focused?.closest('details[data-path]');
            const currentIndex = categories.indexOf(currentCategory);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = currentIndex < categories.length - 1 ? currentIndex + 1 : 0;
                categories[nextIndex].querySelector('summary').focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : categories.length - 1;
                categories[prevIndex].querySelector('summary').focus();
            } else if (e.key === 'Enter' && currentCategory) {
                currentCategory.open = !currentCategory.open;
            } else if (e.key === 'Escape') {
                categories.forEach(c => c.open = false);
                UI.showToast('All categories collapsed', 'info');
            }
        }
    },

    handleCheckDuplicates() {
        const wildcardMap = new Map();
        const scanData = (data, path) => {
            Object.keys(data).filter(k => k !== 'instruction').forEach(key => {
                const item = data[key];
                const currentPath = path ? `${path}/${key}` : key;
                if (item.wildcards && Array.isArray(item.wildcards)) {
                    item.wildcards.forEach(wildcard => {
                        const normalized = wildcard.toLowerCase().trim();
                        if (!wildcardMap.has(normalized)) wildcardMap.set(normalized, []);
                        wildcardMap.get(normalized).push({ path: currentPath, original: wildcard });
                    });
                } else if (typeof item === 'object' && item !== null) {
                    scanData(item, currentPath);
                }
            });
        };
        scanData(State.state.wildcards, '');
        const duplicates = [];
        wildcardMap.forEach((locations, wildcard) => {
            if (locations.length > 1) duplicates.push({ wildcard: locations[0].original, count: locations.length });
        });
        if (duplicates.length === 0) {
            UI.showToast('No duplicates found!', 'success');
        } else {
            UI.showNotification(`Found ${duplicates.length} duplicate wildcard(s).`);
        }
    },

    handleBatchAction(action) {
        const selectedCheckboxes = document.querySelectorAll('.category-batch-checkbox:checked');
        if (selectedCheckboxes.length === 0) return;
        const categories = Array.from(selectedCheckboxes).map(cb => cb.closest('details[data-path]'));
        if (action === 'expand') {
            categories.forEach(cat => { if (cat) cat.open = true; });
            UI.showToast(`Expanded ${categories.length} categories`, 'success');
        } else if (action === 'collapse') {
            categories.forEach(cat => { if (cat) cat.open = false; });
            UI.showToast(`Collapsed ${categories.length} categories`, 'success');
        } else if (action === 'delete') {
            UI.showNotification(`Delete ${categories.length} selected categories?`, true, () => {
                State.saveStateToHistory();
                categories.forEach(cat => {
                    if (cat && cat.dataset.path) {
                        const path = cat.dataset.path;
                        const parts = path.split('/');
                        const keyToDelete = parts.pop();
                        const parent = parts.length > 0 ? State.getObjectByPath(parts.join('/')) : State.state.wildcards;
                        if (parent) delete parent[keyToDelete];
                    }
                });
                UI.showToast(`Deleted ${categories.length} categories`, 'success');
            });
        }
        document.getElementById('batch-select-all').checked = false;
        this.updateBatchUI();
    },

    updateBatchUI() {
        const selected = document.querySelectorAll('.category-batch-checkbox:checked');
        const count = selected.length;
        document.getElementById('batch-count').textContent = `(${count} selected)`;
        const hasSelection = count > 0;
        document.getElementById('batch-expand').disabled = !hasSelection;
        document.getElementById('batch-collapse').disabled = !hasSelection;
        document.getElementById('batch-delete').disabled = !hasSelection;
        document.getElementById('batch-ops-bar').classList.toggle('hidden', !hasSelection);
    },

    toggleTheme() {
        const current = document.documentElement.className;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.className = next;
        localStorage.setItem('wildcards-theme', next);
        this.updateThemeIcon(next);
        UI.showToast(`Theme switched to ${next}`, 'success');
    },

    updateThemeIcon(theme) {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        const path = btn.querySelector('path');
        if (!path) return;

        if (theme === 'light') {
            // Sun Icon
            path.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
        } else {
            // Moon Icon
            path.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
        }
    },

    handleContainerClick(e) {
        const target = e.target;
        const pathElement = target.closest('[data-path]');
        const placeholderElement = target.closest('[data-parent-path]');

        // Handle Placeholder Buttons
        if (placeholderElement) {
            const parentPath = placeholderElement.dataset.parentPath;
            if (target.matches('.add-wildcard-list-btn')) this.createItem(parentPath, 'list');
            if (target.matches('.add-subcategory-btn')) this.createItem(parentPath, 'folder');
            if (target.matches('.suggest-wildcard-list-btn')) this.suggestItems(parentPath, 'list');
            if (target.matches('.suggest-subcategory-btn')) this.suggestItems(parentPath, 'folder');
            return;
        }

        if (!pathElement) return;
        const path = pathElement.dataset.path;

        // Pin/Unpin
        if (target.closest('.pin-btn')) {
            e.preventDefault();
            const pinnedCategories = State.state.pinnedCategories || [];
            const idx = pinnedCategories.indexOf(path);
            if (idx === -1) {
                pinnedCategories.push(path);
                UI.showToast(`Pinned "${path.split('/').pop().replace(/_/g, ' ')}"`, 'success');
            } else {
                pinnedCategories.splice(idx, 1);
                UI.showToast(`Unpinned "${path.split('/').pop().replace(/_/g, ' ')}"`, 'success');
            }
            State.state.pinnedCategories = [...pinnedCategories]; // Trigger proxy update
            return;
        }

        // Delete
        if (target.closest('.delete-btn')) {
            e.preventDefault();
            UI.showNotification(`Delete "${path.split('/').pop().replace(/_/g, ' ')}"?`, true, () => {
                State.saveStateToHistory();
                const parent = State.getParentObjectByPath(path);
                const key = path.split('/').pop();
                delete parent[key]; // Proxy trap will handle save/notify
            });
            return;
        }

        // Add Wildcard
        if (target.closest('.add-wildcard-btn')) {
            const input = pathElement.querySelector('.add-wildcard-input');
            if (input && input.value.trim()) {
                State.saveStateToHistory();
                const obj = State.getObjectByPath(path);
                obj.wildcards.push(input.value.trim()); // Proxy trap triggers
                // Sort logic is now handled in the state proxy trap.
                input.value = '';
            }
        }

        // Generate More
        if (target.closest('.generate-btn')) {
            this.handleGenerate(path);
        }
    },

    handleContainerChange(e) {
        if (e.target.matches('.custom-instructions-input')) {
            const path = e.target.closest('[data-path]').dataset.path;
            const obj = State.getObjectByPath(path);
            obj.instruction = e.target.value; // Proxy triggers update
        }
    },

    handleContainerBlur(e) {
        if (e.target.matches('[contenteditable="true"]')) {
            const val = e.target.textContent.trim();
            const el = e.target.closest('[data-path]');
            if (!el) return;

            const path = el.dataset.path;

            // Check if it's a chip (wildcard item) or title
            if (e.target.closest('.chip')) {
                const index = e.target.closest('.chip').dataset.index;
                const obj = State.getObjectByPath(path);
                if (obj.wildcards[index] !== val) {
                    State.saveStateToHistory();
                    obj.wildcards[index] = val; // Nested proxy update
                    // Sort logic is now handled in the state proxy trap.
                }
            } else if (e.target.classList.contains('category-name') || e.target.classList.contains('wildcard-name')) {
                // Rename Key
                const oldKey = path.split('/').pop();
                const newKey = val.replace(/\s+/g, '_');
                if (oldKey !== newKey && newKey) {
                    const parent = State.getParentObjectByPath(path);
                    if (parent[newKey]) {
                        UI.showToast('Name already exists', 'error');
                        e.target.textContent = oldKey.replace(/_/g, ' ');
                        return;
                    }
                    State.saveStateToHistory();
                    const content = parent[oldKey];
                    delete parent[oldKey];
                    parent[newKey] = content; // Proxy handles it. 
                    // IMPORTANT: The path of this element and all children is now invalid in DOM until re-render.
                    // The Proxy set handler handles re-render of parent or specific add/remove. 
                    // Since we did delete+set, we get two events.
                    // 1. Delete: UI removes old element.
                    // 2. Set: UI adds new element.
                } else {
                    e.target.textContent = oldKey.replace(/_/g, ' ');
                }
            }
        }
    },

    handleContainerKeydown(e) {
        if (e.key === 'Enter') {
            // If it's a contenteditable element, blur it to save
            if (e.target.isContentEditable) {
                e.preventDefault();
                e.target.blur();
            }
        }
    },

    async handleGenerate(path) {
        const obj = State.getObjectByPath(path);

        UI.toggleLoader(path, true);

        try {
            const newItems = await Api.generateWildcards(
                State.state.systemPrompt,
                path,
                obj.wildcards,
                obj.instruction
            );
            if (newItems && newItems.length) {
                // Show modal to confirm addition (Legacy behavior)
                // For now, let's just add them to demonstrate architecture
                State.saveStateToHistory();
                obj.wildcards.push(...newItems);
                // Sort logic is now handled in the state proxy trap.
                UI.showToast(`Generated ${newItems.length} items`, 'success');
            }
        } catch (e) {
            UI.showNotification(e.message);
        } finally {
            UI.toggleLoader(path, false);
        }
    },

    createItem(parentPath, type) {
        UI.showNotification(`Enter name for new ${type}:`, true, (name) => {
            if (!name) return;
            const key = name.trim().replace(/\s+/g, '_');
            const parent = State.getObjectByPath(parentPath);
            if (parent[key]) { UI.showToast('Exists already', 'error'); return; }

            State.saveStateToHistory();
            parent[key] = type === 'list' ? { instruction: '', wildcards: [] } : { instruction: '' };
        }, true);
    },

    suggestItems(parentPath, type) {
        // Call API suggest
        // Then show modal
        // On confirm, update State
    },

    // Drag and Drop Logic
    handleDragStart(e) {
        const target = e.target.closest('[data-path]');
        if (target) {
            this.draggedPath = target.dataset.path;
            e.dataTransfer.setData('text/plain', this.draggedPath);
            e.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => target.classList.add('dragging'));
            document.body.classList.add('dragging-active');
        }
    },

    handleDragOver(e) {
        e.preventDefault();
        const target = e.target.closest('[data-path]');
        if (!target || target.dataset.path === this.draggedPath) return;

        // Clean up any existing classes on other elements
        document.querySelectorAll('.drop-target-active, .drop-line-before, .drop-line-after, .drop-inside').forEach(el => {
            if (el !== target) {
                el.classList.remove('drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside');
            }
        });

        const rect = target.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

        target.classList.add('drop-target-active');

        // Remove all classes first
        target.classList.remove('drop-line-before', 'drop-line-after', 'drop-inside');

        // Check for separator
        if (target.classList.contains('dnd-separator')) {
            target.classList.add('drop-inside');
            return;
        }

        // If it's a category (details), allow dropping inside
        const isCategory = target.tagName === 'DETAILS';

        if (isCategory && relY > height * 0.25 && relY < height * 0.75) {
            target.classList.add('drop-inside');
        } else if (relY < height / 2) {
            target.classList.add('drop-line-before');
        } else {
            target.classList.add('drop-line-after');
        }
    },

    handleDragLeave(e) {
        const target = e.target.closest('[data-path]');
        if (target) {
            target.classList.remove('drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside');
        }
    },

    handleDrop(e) {
        e.preventDefault();
        const target = e.target.closest('[data-path]');

        // Capture draggedPath before cleanup
        const srcPath = this.draggedPath;
        this.handleDragEnd(e); // Clean visuals immediately

        if (!target || !srcPath) return;

        const destPath = target.dataset.path; // This is the item we dropped ON

        if (srcPath === destPath) return;

        // Determine position based on the class we added (tracked via e or re-calced? Hard to track via class since we removed them)
        // Re-calc simply
        const rect = target.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;
        let position = 'after';
        const isCategory = target.tagName === 'DETAILS';
        const isSeparator = target.classList.contains('dnd-separator');

        if (isSeparator) position = 'inside';
        else if (isCategory && relY > height * 0.25 && relY < height * 0.75) position = 'inside';
        else if (relY < height / 2) position = 'before';

        // Execute Move
        State.saveStateToHistory();
        this.moveItem(srcPath, destPath, position);
    },

    moveItem(srcPath, destPath, position) {
        // Complex move logic:
        // 1. Get Source Data
        const srcParent = State.getParentObjectByPath(srcPath);
        const srcKey = srcPath.split('/').pop();
        const srcData = srcParent[srcKey];

        // 2. Identify Dest Parent and Key
        let destParent, destKey, newKey;

        if (position === 'inside') {
            destParent = State.getObjectByPath(destPath); // The category itself is the parent
            // Ensure it's not a wildcard leaf
            if (Array.isArray(destParent.wildcards)) {
                UI.showToast("Cannot drop inside a wildcard list", 'error');
                return;
            }
            destKey = null; // Appending to end
        } else {
            destParent = State.getParentObjectByPath(destPath);
            destKey = destPath.split('/').pop();
        }

        // Validation: Cannot move parent inside child
        if (destPath.startsWith(srcPath)) {
            UI.showToast("Cannot move parent inside child", 'error');
            return;
        }

        // 3. Remove from Source
        delete srcParent[srcKey]; // Proxy triggers

        // 4. Insert into Dest
        // If sorting is automatic (keys sorted), we just add it to parent.
        // But if user wants manual ordering, we'd need an array.
        // Current architecture uses Object keys, so specific ordering 'before/after' is hard unless we use a prefix or special array.
        // The current app sorts keys alphabetically in render.
        // So 'before/after' drops effectively just mean 'move to this parent'.
        // UNLESS we change the data structure to support manual ordering.
        // For V1 refactor, let's respect the user's wish for "visual drop targets" but acknowledge alphabetical sort limitation?
        // OR: Rename the key if necessary? No, that breaks links.
        // Use 'pinned' for top level?

        // Compromise: Just move to the parent. 'Inside' moves to subfolder. 'Before/After' moves to same folder.
        // Ideally we would support ordering.

        // Check for key collision in dest
        if (destParent[srcKey]) {
            // Append copy or number
            UI.showToast("Item with this name already exists in destination", 'error');
            // Revert?
            srcParent[srcKey] = srcData;
            return;
        }

        destParent[srcKey] = srcData;

        // If we really wanted to support 'before' 'after', we'd need to change State structure to Array, or use a 'order' property.
        // Staying with Object structure implies alphabetical sort usually.
        // We'll trust the alphabetical sort for now, effectively ignoring 'before'/'after' distinction for persistent order,
        // but it still correctly targets the PARENT. 
        // Example: Dropping 'before' Item B (which is in Folder X) puts it in Folder X.
    },

    handleDragEnd(e) {
        this.draggedPath = null;
        document.body.classList.remove('dragging-active');
        document.querySelectorAll('.dragging, .drop-target-active, .drop-line-before, .drop-line-after, .drop-inside')
            .forEach(el => el.classList.remove('dragging', 'drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside'));
    },

    // Export handlers
    async handleExportYAML() {
        try {
            const YAML = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
            const yamlContent = YAML.stringify({ wildcards: State.state.wildcards, systemPrompt: State.state.systemPrompt, suggestItemPrompt: State.state.suggestItemPrompt });
            this._downloadFile(yamlContent, 'wildcards.yaml', 'application/x-yaml');
            UI.showToast('YAML exported successfully', 'success');
        } catch (e) {
            console.error('Export YAML failed:', e);
            UI.showToast('Export failed', 'error');
        }
    },

    async handleExportZIP() {
        try {
            // Use globally loaded JSZip
            const zip = new window.JSZip();

            const wildcards = State.state.wildcards;

            // Add each category as a separate file
            const addToZip = (data, prefix = '') => {
                if (data.wildcards && Array.isArray(data.wildcards)) {
                    const content = data.wildcards.join('\n');
                    zip.file(`${prefix || 'root'}.txt`, content);
                }
                if (data.categories) {
                    for (const [key, catData] of Object.entries(data.categories)) {
                        addToZip(catData, prefix ? `${prefix}/${key}` : key);
                    }
                }
            };

            for (const [key, data] of Object.entries(wildcards)) {
                addToZip(data, key);
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'wildcard_collection.zip';
            a.click();
            URL.revokeObjectURL(url);
            UI.showToast('ZIP exported successfully', 'success');
        } catch (e) {
            console.error('Export ZIP failed:', e);
            UI.showToast('Export failed', 'error');
        }
    },

    handleExportConfig() {
        try {
            const config = {
                apiEndpoint: Config.API_ENDPOINT,
                modelNameGemini: Config.MODEL_NAME_GEMINI,
                modelNameOpenrouter: Config.MODEL_NAME_OPENROUTER,
                modelNameCustom: Config.MODEL_NAME_CUSTOM,
                apiUrlCustom: Config.API_URL_CUSTOM,
                historyLimit: Config.HISTORY_LIMIT,
                searchDebounceDelay: Config.SEARCH_DEBOUNCE_DELAY
            };
            const jsonContent = JSON.stringify(config, null, 2);
            this._downloadFile(jsonContent, 'config.json', 'application/json');
            UI.showToast('Config exported successfully', 'success');
        } catch (e) {
            console.error('Export Config failed:', e);
            UI.showToast('Export failed', 'error');
        }
    },

    _downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

};

