import { State } from './state.js';
import { UI } from './ui.js';
import { Api } from './api.js';
import { Config, saveApiKey, saveConfig } from './config.js';
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

        // Double-click to edit names (category names, wildcard names, chip text)
        UI.elements.container.addEventListener('dblclick', (e) => {
            const editableEl = e.target.closest('.editable-name');
            if (editableEl && !editableEl.isContentEditable) {
                e.stopPropagation(); // Prevent category toggle
                this.enableEditing(editableEl);
            }

            const editableInput = e.target.closest('.editable-input');
            if (editableInput && editableInput.readOnly) {
                e.preventDefault(); // Create standard behavior
                e.stopPropagation(); // Prevent category toggle
                this.enableEditing(editableInput);
            }
        });

        // Click on pencil icon also enables editing
        UI.elements.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-icon')) {
                const wrapper = e.target.closest('.editable-wrapper') || e.target.closest('.chip');
                if (!wrapper) return;

                const editableEl = wrapper.querySelector('.editable-name');
                if (editableEl && !editableEl.isContentEditable) {
                    e.stopPropagation();
                    this.enableEditing(editableEl);
                    return;
                }

                const editableInput = wrapper.querySelector('.editable-input');
                if (editableInput && editableInput.readOnly) {
                    e.stopPropagation();
                    this.enableEditing(editableInput);
                    return;
                }
            }
        });

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
                btn.disabled = true;
                btn.textContent = '⏳';
                Api.testConnection(provider, (msg, type) => UI.showToast(msg, type))
                    .then(models => {
                        UI.populateModelList(provider, models);
                    })
                    .finally(() => {
                        btn.textContent = '🔌 Test';
                        btn.disabled = false;
                    });
            }
            // Test Model Button
            if (e.target.matches('.test-model-btn') || e.target.closest('.test-model-btn')) {
                const btn = e.target.closest('.test-model-btn') || e.target;
                const provider = btn.dataset.provider;
                const panel = document.querySelector(`#settings-${provider}`);
                const apiKey = panel?.querySelector('.api-key-input')?.value;
                const modelName = panel?.querySelector('.model-name-input')?.value;
                const statsEl = panel?.querySelector('.model-stats');

                if (!modelName?.trim()) {
                    UI.showToast('Please enter a model name first', 'warning');
                    return;
                }

                btn.disabled = true;
                const origText = btn.textContent;
                btn.textContent = '⏳ Testing...';
                if (statsEl) {
                    statsEl.classList.add('hidden');
                    statsEl.textContent = '';
                }

                Api.testModel(provider, apiKey, modelName, (result) => {
                    const dialog = document.getElementById('api-test-dialog');
                    const timeEl = document.getElementById('api-test-time');
                    const jsonEl = document.getElementById('api-test-json');
                    const responseEl = document.getElementById('api-test-response');
                    const iconEl = document.getElementById('api-test-status-icon');
                    const closeBtn = document.getElementById('api-test-close-btn');

                    if (result.success) {
                        // Update stats in settings panel
                        if (statsEl) {
                            statsEl.textContent = `Last test: ${result.stats.responseTime}ms${result.stats.supportsJson ? ' ✓ JSON' : ''}`;
                            statsEl.classList.remove('hidden');
                        }

                        // Populate Dialog
                        timeEl.textContent = `${result.stats.responseTime} ms`;
                        jsonEl.textContent = result.stats.supportsJson ? 'Yes' : 'No';
                        jsonEl.className = `text-lg font-mono ${result.stats.supportsJson ? 'text-green-400' : 'text-yellow-400'}`;
                        iconEl.textContent = '✅';

                        try {
                            const parsed = JSON.parse(result.stats.rawResponse);
                            responseEl.textContent = JSON.stringify(parsed, null, 2);
                        } catch (e) {
                            responseEl.textContent = result.stats.rawResponse || '(No content)';
                        }
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-green-300 custom-scrollbar";
                    } else {
                        iconEl.textContent = '❌';
                        timeEl.textContent = result.stats?.responseTime ? `${result.stats.responseTime} ms` : '--';
                        jsonEl.textContent = 'N/A';
                        responseEl.textContent = result.error;
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-red-400 custom-scrollbar";
                    }

                    dialog.showModal();

                    // Close handlers
                    const closeHandler = () => {
                        dialog.close();
                        closeBtn.removeEventListener('click', closeHandler);
                        dialog.removeEventListener('click', backdropHandler);
                    };
                    const backdropHandler = (e) => {
                        if (e.target === dialog) closeHandler();
                    };

                    closeBtn.addEventListener('click', closeHandler);
                    dialog.addEventListener('click', backdropHandler);

                }).finally(() => {
                    btn.textContent = origText;
                    btn.disabled = false;
                });
            }
            // Help Button
            if (e.target.matches('#help-btn')) {
                UI.showNotification(`
<div class="text-left space-y-4 max-w-lg">
    <h3 class="text-xl font-bold text-indigo-300 flex items-center gap-2">🚀 Getting Started</h3>
    <ul class="list-none space-y-2 text-sm">
        <li class="flex items-start gap-2">
            <span class="text-indigo-400">⚙️</span>
            <span><strong>Settings:</strong> Configure API keys via the gear icon in the toolbar</span>
        </li>
        <li class="flex items-start gap-2">
            <span class="text-green-400">📁</span>
            <span><strong>Categories:</strong> Click to expand, drag to reorder or nest</span>
        </li>
        <li class="flex items-start gap-2">
            <span class="text-purple-400">✨</span>
            <span><strong>Generate:</strong> Use AI to create new wildcards for any list</span>
        </li>
        <li class="flex items-start gap-2">
            <span class="text-blue-400">💾</span>
            <span><strong>Export/Import:</strong> Save and load your entire setup as YAML or ZIP</span>
        </li>
    </ul>

    <h3 class="text-lg font-bold text-indigo-300 mt-4">⌨️ Keyboard Shortcuts</h3>
    <div class="grid grid-cols-2 gap-2 text-sm bg-gray-800/50 rounded-lg p-3">
        <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+S</kbd></div><div class="text-gray-400">Auto-save reminder</div>
        <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+Z</kbd></div><div class="text-gray-400">Undo</div>
        <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+Y</kbd></div><div class="text-gray-400">Redo</div>
        <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Escape</kbd></div><div class="text-gray-400">Collapse all</div>
        <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">↑ / ↓</kbd></div><div class="text-gray-400">Navigate categories</div>
    </div>

    <h3 class="text-lg font-bold text-indigo-300 mt-4">💡 Tips</h3>
    <ul class="text-sm text-gray-300 list-disc list-inside space-y-1">
        <li>Click any title to rename it inline</li>
        <li>Use "Check Duplicates" to find and manage repeated entries</li>
        <li>Pin frequently used categories to keep them at the top</li>
        <li>Use the overflow menu (⋮) for reset options and config export</li>
    </ul>
</div>
`);
            }
            // Check Duplicates
            if (e.target.matches('#check-duplicates')) {
                this.handleCheckDuplicates();
            }
            // Reset Options
            if (e.target.matches('#reset-localstorage')) {
                UI.showNotification('Clear all saved data from localStorage?\nThis includes remembered API keys and settings.', true, () => {
                    const keys = Object.keys(localStorage).filter(k => k.startsWith('wildcards'));
                    keys.forEach(k => localStorage.removeItem(k));
                    UI.showToast(`Cleared ${keys.length} localStorage items`, 'success');
                });
            }
            if (e.target.matches('#reset-sessionstorage')) {
                UI.showNotification('Clear session storage?\nThis includes temporary API keys and UI state.', true, () => {
                    const keys = Object.keys(sessionStorage).filter(k => k.startsWith('wildcards'));
                    keys.forEach(k => sessionStorage.removeItem(k));
                    UI.showToast(`Cleared ${keys.length} sessionStorage items`, 'success');
                });
            }
            if (e.target.matches('#reset-defaults')) {
                UI.showNotification('Reset everything to defaults?\n⚠️ This will clear all wildcards, settings, and history!', true, () => {
                    State.resetState();
                    UI.showToast('Reset to defaults complete', 'success');
                });
            }
            if (e.target.matches('#reload-default-data')) {
                UI.showNotification('Reload default wildcard data?\nYour settings will be preserved.', true, async () => {
                    try {
                        const response = await fetch('data/wildcards.yaml');
                        const text = await response.text();
                        const YAML = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
                        const data = YAML.parse(text);
                        State.saveStateToHistory();
                        State.state.wildcards = data.wildcards || data;
                        if (data.systemPrompt) State.state.systemPrompt = data.systemPrompt;
                        if (data.suggestItemPrompt) State.state.suggestItemPrompt = data.suggestItemPrompt;
                        UI.showToast('Default data reloaded', 'success');
                    } catch (err) {
                        console.error('Failed to reload default data:', err);
                        UI.showToast(`Failed: ${err.message}`, 'error');
                    }
                });
            }
            // Legacy reset button (if exists)
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
            // Import YAML
            if (e.target.matches('#import-yaml')) {
                this.handleImportYAML();
            }
            // Import Config
            if (e.target.matches('#import-config')) {
                this.handleImportConfig();
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

    // Stored duplicates for filtering/highlighting
    _lastDuplicates: null,
    _duplicateMap: null,

    handleCheckDuplicates() {
        const wildcardMap = new Map();
        const scanData = (data, path) => {
            Object.keys(data).filter(k => k !== 'instruction').forEach(key => {
                const item = data[key];
                const currentPath = path ? `${path}/${key}` : key;
                if (item.wildcards && Array.isArray(item.wildcards)) {
                    item.wildcards.forEach((wildcard, idx) => {
                        const normalized = wildcard.toLowerCase().trim();
                        if (!wildcardMap.has(normalized)) wildcardMap.set(normalized, []);
                        wildcardMap.get(normalized).push({ path: currentPath, original: wildcard, index: idx });
                    });
                } else if (typeof item === 'object' && item !== null) {
                    scanData(item, currentPath);
                }
            });
        };
        scanData(State.state.wildcards, '');

        // Build duplicates list
        const duplicates = [];
        const duplicateNormalized = new Set();
        wildcardMap.forEach((locations, normalized) => {
            if (locations.length > 1) {
                duplicates.push({ normalized, locations, count: locations.length });
                duplicateNormalized.add(normalized);
            }
        });

        this._lastDuplicates = duplicates;
        this._duplicateMap = duplicateNormalized;

        if (duplicates.length === 0) {
            UI.showToast('No duplicates found!', 'success');
            return;
        }

        // Show actionable dialog
        const totalOccurrences = duplicates.reduce((sum, d) => sum + d.count, 0);
        const message = `
<div class="text-left space-y-3">
    <p class="text-lg">Found <strong class="text-indigo-400">${duplicates.length}</strong> duplicate wildcards (${totalOccurrences} total occurrences)</p>
    <div class="space-y-2">
        <button id="dupe-highlight" class="w-full text-left px-3 py-2 bg-yellow-900/30 hover:bg-yellow-800/50 rounded-md transition-colors" title="Add visual highlights to all duplicate wildcards in the UI">
            🔆 <strong>Highlight Duplicates</strong>
            <span class="text-sm text-gray-400 block ml-6">Add visual indicators to duplicate wildcards</span>
        </button>
        <button id="dupe-filter" class="w-full text-left px-3 py-2 bg-blue-900/30 hover:bg-blue-800/50 rounded-md transition-colors" title="Filter view to show only cards containing duplicate wildcards">
            🔍 <strong>Show Duplicates Only</strong>
            <span class="text-sm text-gray-400 block ml-6">Filter to show only cards with duplicates</span>
        </button>
        <button id="dupe-clear" class="w-full text-left px-3 py-2 bg-gray-700/30 hover:bg-gray-600/50 rounded-md transition-colors" title="Remove all duplicate highlights and filters">
            ✖️ <strong>Clear Highlights</strong>
            <span class="text-sm text-gray-400 block ml-6">Remove all duplicate visual indicators</span>
        </button>
    </div>
    <details class="mt-4">
        <summary class="cursor-pointer text-indigo-400 hover:text-indigo-300">View duplicate list (${duplicates.length})</summary>
        <ul class="mt-2 text-sm max-h-40 overflow-y-auto custom-scrollbar space-y-1">
            ${duplicates.slice(0, 20).map(d => `<li class="text-gray-300">"${d.locations[0].original}" - ${d.count} occurrences</li>`).join('')}
            ${duplicates.length > 20 ? `<li class="text-gray-500">...and ${duplicates.length - 20} more</li>` : ''}
        </ul>
    </details>
</div>`;

        UI.showNotification(message, false, null, false); // html auto-detected

        // Bind action buttons after dialog renders
        setTimeout(() => {
            document.getElementById('dupe-highlight')?.addEventListener('click', () => {
                this.highlightDuplicates();
                UI.elements.notificationDialog?.close();
            });
            document.getElementById('dupe-filter')?.addEventListener('click', () => {
                this.filterToDuplicates();
                UI.elements.notificationDialog?.close();
            });
            document.getElementById('dupe-clear')?.addEventListener('click', () => {
                this.clearDuplicateHighlights();
                UI.elements.notificationDialog?.close();
            });
        }, 100);
    },

    highlightDuplicates() {
        if (!this._duplicateMap || this._duplicateMap.size === 0) {
            UI.showToast('No duplicates to highlight', 'info');
            return;
        }
        document.querySelectorAll('.chip').forEach(chip => {
            const text = chip.querySelector('span[contenteditable]')?.textContent?.toLowerCase().trim();
            if (text && this._duplicateMap.has(text)) {
                chip.classList.add('chip-duplicate');
            }
        });
        UI.showToast(`Highlighted ${this._duplicateMap.size} duplicate wildcards`, 'success');
    },

    filterToDuplicates() {
        if (!this._lastDuplicates || this._lastDuplicates.length === 0) {
            UI.showToast('No duplicates to filter', 'info');
            return;
        }
        // Get all paths containing duplicates
        const pathsWithDupes = new Set();
        this._lastDuplicates.forEach(d => {
            d.locations.forEach(loc => pathsWithDupes.add(loc.path));
        });

        // Hide cards not in the set
        document.querySelectorAll('.wildcard-card').forEach(card => {
            const path = card.dataset.path;
            if (pathsWithDupes.has(path)) {
                card.classList.remove('hidden');
                card.classList.add('duplicate-focus');
            } else {
                card.classList.add('hidden');
            }
        });

        // Expand categories containing duplicates
        pathsWithDupes.forEach(path => {
            const parts = path.split('/');
            let currentPath = '';
            parts.forEach((part, i) => {
                currentPath += (i > 0 ? '/' : '') + part;
                const el = document.querySelector(`details[data-path="${currentPath}"]`);
                if (el) el.open = true;
            });
        });

        this.highlightDuplicates();
        UI.showToast(`Showing ${pathsWithDupes.size} cards with duplicates`, 'success');
    },

    clearDuplicateHighlights() {
        document.querySelectorAll('.chip-duplicate').forEach(el => el.classList.remove('chip-duplicate'));
        document.querySelectorAll('.duplicate-focus').forEach(el => el.classList.remove('duplicate-focus'));
        // Only remove hidden class from cards that were hidden by duplicate filter (marked with duplicate-focus)
        // Don't remove hidden from search-filtered items
        document.querySelectorAll('.wildcard-card.hidden').forEach(el => {
            // If this was hidden by duplicate filter, it should have been in a duplicate path
            // For now, just re-render to restore search state
        });
        UI.showToast('Duplicate highlights cleared', 'info');
        // Re-run search to restore proper visibility
        const searchInput = document.getElementById('search-wildcards');
        if (searchInput && searchInput.value) {
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
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

            // Disable contenteditable after blur (for double-click edit mode)
            if (e.target.classList.contains('editable-name')) {
                e.target.removeAttribute('contenteditable');
            }

            // Re-enable readonly for inputs
            if (e.target.classList.contains('editable-input')) {
                e.target.readOnly = true;
            }
        }
    },

    handleContainerKeydown(e) {
        if (e.key === 'Enter') {
            // Rapid Entry for Wildcard Items
            if (e.target.classList.contains('add-wildcard-input')) {
                e.preventDefault(); // Prevent blur
                const input = e.target;
                const val = input.value.trim();
                const pathElement = input.closest('[data-path]');
                if (val && pathElement) {
                    const path = pathElement.dataset.path;
                    State.saveStateToHistory();
                    const obj = State.getObjectByPath(path);
                    if (obj && Array.isArray(obj.wildcards)) {
                        obj.wildcards.push(val);
                        input.value = '';
                        input.focus(); // Ensure focus remains
                    }
                }
                return;
            }

            // If it's a contenteditable element, blur it to save
            if (e.target.isContentEditable) {
                e.preventDefault();
                e.target.blur();
            }
            // For inputs, just blur
            if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                e.target.blur();
            }
        }
        // Escape key to cancel editing
        if (e.key === 'Escape') {
            if (e.target.isContentEditable) {
                e.target.removeAttribute('contenteditable');
                e.target.blur();
            } else if (e.target.tagName === 'INPUT' && !e.target.readOnly && e.target.classList.contains('editable-input')) {
                e.target.readOnly = true;
                e.target.blur();
            }
        }
    },

    // Enable contenteditable on an element for editing
    enableEditing(el) {
        if (el.tagName === 'INPUT') {
            el.readOnly = false;
            el.focus();
            el.select();
        } else {
            el.setAttribute('contenteditable', 'true');
            el.focus();
            // Select all text for easy replacement
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
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

    handleImportYAML() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yaml,.yml';
        input.title = 'Select a YAML file to import wildcards';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const YAML = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
                const data = YAML.parse(text);

                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid YAML structure');
                }

                // Merge or replace - ask user
                const hasExisting = Object.keys(State.state.wildcards).length > 0;
                if (hasExisting) {
                    UI.showNotification('Merge with existing data or replace everything?', true, () => {
                        // Replace mode
                        State.saveStateToHistory();
                        if (data.wildcards) {
                            State.state.wildcards = data.wildcards;
                        } else {
                            State.state.wildcards = data;
                        }
                        if (data.systemPrompt) State.state.systemPrompt = data.systemPrompt;
                        if (data.suggestItemPrompt) State.state.suggestItemPrompt = data.suggestItemPrompt;
                        UI.showToast(`Imported ${file.name} (replaced)`, 'success');
                    });
                    // For merge, we'd need a separate button. For now, confirm = replace
                } else {
                    State.saveStateToHistory();
                    if (data.wildcards) {
                        State.state.wildcards = data.wildcards;
                    } else {
                        State.state.wildcards = data;
                    }
                    if (data.systemPrompt) State.state.systemPrompt = data.systemPrompt;
                    if (data.suggestItemPrompt) State.state.suggestItemPrompt = data.suggestItemPrompt;
                    UI.showToast(`Imported ${file.name}`, 'success');
                }
            } catch (err) {
                console.error('Import YAML failed:', err);
                UI.showToast(`Import failed: ${err.message}`, 'error');
            }
        };
        input.click();
    },

    handleImportConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.title = 'Select a JSON config file to import settings';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const config = JSON.parse(text);

                // Apply config values
                if (config.apiEndpoint) Config.API_ENDPOINT = config.apiEndpoint;
                if (config.modelNameGemini) Config.MODEL_NAME_GEMINI = config.modelNameGemini;
                if (config.modelNameOpenrouter) Config.MODEL_NAME_OPENROUTER = config.modelNameOpenrouter;
                if (config.modelNameCustom) Config.MODEL_NAME_CUSTOM = config.modelNameCustom;
                if (config.apiUrlCustom) Config.API_URL_CUSTOM = config.apiUrlCustom;
                if (config.historyLimit) Config.HISTORY_LIMIT = config.historyLimit;
                if (config.searchDebounceDelay) Config.SEARCH_DEBOUNCE_DELAY = config.searchDebounceDelay;

                // Persist to storage
                saveConfig();

                // Update UI
                const endpointSelect = document.getElementById('api-endpoint');
                if (endpointSelect) endpointSelect.value = Config.API_ENDPOINT;
                UI.updateSettingsVisibility(Config.API_ENDPOINT);
                UI.renderApiSettings();

                UI.showToast(`Config imported from ${file.name}`, 'success');
            } catch (err) {
                console.error('Import Config failed:', err);
                UI.showToast(`Import failed: ${err.message}`, 'error');
            }
        };
        input.click();
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

