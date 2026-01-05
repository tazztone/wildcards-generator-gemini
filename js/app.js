import { State } from './state.js';
import { UI } from './ui.js';
import { Api } from './api.js';
import { Config, saveApiKey, saveConfig } from './config.js';
import { DragDrop } from './modules/drag-drop.js';
import { ImportExport } from './modules/import-export.js';
import { Settings } from './modules/settings.js';

export const App = {
    draggedPath: null,

    async init() {
        UI.init();
        await State.init();

        this.bindEvents();

        const theme = localStorage.getItem('wildcards-theme') || 'dark';
        document.documentElement.className = theme;
        this.updateThemeIcon(theme);

        setTimeout(() => Settings.verifyStoredApiKeys(), 500);
    },

    bindEvents() {
        UI.elements.container.addEventListener('click', (e) => this.handleContainerClick(e));
        UI.elements.container.addEventListener('change', (e) => this.handleContainerChange(e));
        UI.elements.container.addEventListener('blur', (e) => this.handleContainerBlur(e), true);
        UI.elements.container.addEventListener('keydown', (e) => this.handleContainerKeydown(e));

        UI.elements.container.addEventListener('dblclick', (e) => {
            const editableEl = e.target.closest('.editable-name');
            if (editableEl && !editableEl.isContentEditable) {
                e.stopPropagation();
                this.enableEditing(editableEl);
            }

            const editableInput = e.target.closest('.editable-input');
            if (editableInput && editableInput.readOnly) {
                e.preventDefault();
                e.stopPropagation();
                this.enableEditing(editableInput);
            }
        });

        UI.elements.container.addEventListener('click', (e) => {
            const summary = e.target.closest('summary');
            if (summary) {
                if (e.target.closest('.pin-btn') || e.target.closest('.delete-btn') || e.target.classList.contains('edit-icon')) {
                    e.preventDefault();
                    return;
                }
                const editableInEditMode = summary.querySelector('[contenteditable="true"]');
                const inputInEditMode = summary.querySelector('.editable-input:not([readonly])');
                if (editableInEditMode || inputInEditMode) {
                    e.preventDefault();
                    return;
                }
                const clickedInput = e.target.closest('.editable-input');
                if (clickedInput && clickedInput.readOnly) {
                    const details = summary.closest('details');
                    if (details) {
                        details.open = !details.open;
                    }
                    clickedInput.blur();
                }
            }
        });

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

        DragDrop.bindEvents(UI.elements.container);

        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('undo-btn')?.addEventListener('click', () => State.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => State.redo());

        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = e.target.value;
            Config.API_ENDPOINT = provider;
            saveConfig();
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
            if (e.target.matches('.test-model-btn') || e.target.closest('.test-model-btn')) {
                const btn = e.target.closest('.test-model-btn') || e.target;
                const provider = btn.dataset.provider;
                const panel = document.querySelector(`#settings-${provider}`);
                const apiKey = panel?.querySelector('.api-key-input')?.value?.trim();
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

                    const urlEl = document.getElementById('api-test-url');
                    const payloadEl = document.getElementById('api-test-payload');
                    const previewSection = document.getElementById('api-test-preview-section');
                    const previewEl = document.getElementById('api-test-preview');
                    const closeBtn = document.getElementById('api-test-close-btn');

                    previewSection.classList.add('hidden');
                    previewEl.innerHTML = '';

                    timeEl.textContent = result.stats?.responseTime ? `${result.stats.responseTime} ms` : '-- ms';

                    if (result.stats?.request) {
                        urlEl.textContent = result.stats.request.url;
                        try {
                            const safePayload = JSON.parse(JSON.stringify(result.stats.request.payload));
                            payloadEl.textContent = JSON.stringify(safePayload, null, 2);
                        } catch (e) {
                            payloadEl.textContent = String(result.stats.request.payload);
                        }
                    } else {
                        urlEl.textContent = 'Unknown';
                        payloadEl.textContent = '--';
                    }

                    if (result.success) {
                        if (statsEl) {
                            statsEl.textContent = `Last test: ${result.stats.responseTime}ms${result.stats.supportsJson ? ' ✓ JSON' : ''}`;
                            statsEl.classList.remove('hidden');
                        }

                        jsonEl.textContent = `JSON: ${result.stats.supportsJson ? 'YES' : 'NO'}`;
                        jsonEl.className = `text-sm font-bold bg-gray-900/50 px-2 py-1 rounded border border-gray-700 ${result.stats.supportsJson ? 'text-green-400 border-green-900' : 'text-yellow-400 border-yellow-900'}`;
                        iconEl.textContent = '✅';

                        if (result.stats.parsedContent && Array.isArray(result.stats.parsedContent)) {
                            previewSection.classList.remove('hidden');
                            previewEl.innerHTML = result.stats.parsedContent.map(item =>
                                `<span class="px-2 py-1 bg-indigo-900/50 text-indigo-200 border border-indigo-700/50 rounded text-xs">${item}</span>`
                            ).join('');
                        } else if (typeof result.stats.parsedContent === 'object') {
                            previewSection.classList.remove('hidden');
                            previewEl.innerHTML = `<span class="text-gray-400 text-xs italic">Result is an object, not an array. (Count: ${Object.keys(result.stats.parsedContent).length})</span>`;
                        }

                        responseEl.textContent = result.stats.rawResponse;
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-green-300 custom-scrollbar whitespace-pre-wrap";
                    } else {
                        iconEl.textContent = '❌';
                        jsonEl.textContent = 'JSON: N/A';
                        jsonEl.className = "text-sm font-bold bg-gray-900/50 px-2 py-1 rounded border border-gray-700 text-gray-500";

                        responseEl.textContent = result.error;
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-red-400 custom-scrollbar whitespace-pre-wrap";
                    }

                    dialog.showModal();

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
            if (e.target.matches('#check-duplicates')) {
                this.handleCheckDuplicates();
            }
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
                    UI.toggleOverflowMenu(false);
                    await State.resetState();
                    UI.renderAll();
                    UI.showToast('Default data reloaded', 'success');
                });
            }
            if (e.target.matches('#factory-reset')) {
                UI.showNotification('⚠️ Factory Reset? This will delete ALL wildcards and settings. Cannot be undone.', true, () => {
                    UI.toggleOverflowMenu(false);
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                });
            }
            if (e.target.matches('#reset-btn')) {
                UI.showNotification('Are you sure you want to reset everything?', true, () => State.resetState());
            }
            if (e.target.matches('#add-category-placeholder-btn')) {
                UI.showNotification('Enter new top-level category name:', true, (name) => {
                    if (name && name.trim()) {
                        const key = name.trim().replace(/\s+/g, '_');
                        if (State.state.wildcards[key]) { UI.showToast('Category already exists', 'error'); return; }
                        State.saveStateToHistory();
                        State.state.wildcards[key] = { instruction: '' };
                        UI.showToast(`Created "${name.trim()}"`, 'success');
                    }
                }, true);
            }
            if (e.target.matches('#suggest-toplevel-btn')) {
                this.suggestItems(null, 'folder');
            }
            if (e.target.matches('#export-yaml')) {
                ImportExport.handleExportYAML();
            }
            if (e.target.matches('#download-all-zip')) {
                ImportExport.handleExportZIP();
            }
            if (e.target.matches('#export-settings-btn')) {
                ImportExport.handleExportSettings();
            }
            if (e.target.matches('#load-settings-btn')) {
                document.getElementById('settings-file-input').click();
            }
            if (e.target.matches('#reset-settings-btn')) {
                ImportExport.handleResetSettings();
            }

            if (e.target.matches('#import-yaml')) {
                ImportExport.handleImportYAML();
            }

            if (e.target.matches('#batch-expand')) this.handleBatchAction('expand');
            if (e.target.matches('#batch-collapse')) this.handleBatchAction('collapse');
            if (e.target.matches('#batch-delete')) this.handleBatchAction('delete');
        });

        document.getElementById('settings-file-input')?.addEventListener('change', (e) => ImportExport.handleLoadSettings(e));

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

        UI.showNotification(message, false, null, false);

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
        const pathsWithDupes = new Set();
        this._lastDuplicates.forEach(d => {
            d.locations.forEach(loc => pathsWithDupes.add(loc.path));
        });

        document.querySelectorAll('.wildcard-card').forEach(card => {
            const path = card.dataset.path;
            if (pathsWithDupes.has(path)) {
                card.classList.remove('hidden');
                card.classList.add('duplicate-focus');
            } else {
                card.classList.add('hidden');
            }
        });

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
        document.querySelectorAll('.wildcard-card.hidden').forEach(el => {
        });
        UI.showToast('Duplicate highlights cleared', 'info');
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
            path.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
        } else {
            path.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
        }
    },

    handleContainerClick(e) {
        const target = e.target;
        const pathElement = target.closest('[data-path]');
        const placeholderElement = target.closest('[data-parent-path]');

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
            State.state.pinnedCategories = [...pinnedCategories];
            return;
        }

        if (target.closest('.delete-btn')) {
            e.preventDefault();
            UI.showNotification(`Delete "${path.split('/').pop().replace(/_/g, ' ')}"?`, true, () => {
                State.saveStateToHistory();
                const parent = State.getParentObjectByPath(path);
                const key = path.split('/').pop();
                delete parent[key];
            });
            return;
        }

        if (target.closest('.add-wildcard-btn')) {
            const input = pathElement.querySelector('.add-wildcard-input');
            if (input && input.value.trim()) {
                State.saveStateToHistory();
                const obj = State.getObjectByPath(path);
                obj.wildcards.push(input.value.trim());
                input.value = '';
            }
        }

        if (target.closest('.generate-btn')) {
            this.handleGenerate(path);
        }

        if (target.closest('.copy-btn')) {
            const btn = target.closest('.copy-btn');
            const obj = State.getObjectByPath(path);
            if (obj && obj.wildcards && obj.wildcards.length > 0) {
                const text = obj.wildcards.join(', ');
                navigator.clipboard.writeText(text).then(() => {
                    UI.showToast(`Copied ${obj.wildcards.length} wildcards`, 'success');

                    // Visual Feedback
                    const originalTitle = btn.dataset.originalTitle || 'Copy all wildcards';
                    const iconSpan = btn.querySelector('.btn-icon');

                    if (iconSpan) {
                         // Swap to Checkmark
                         iconSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    }

                    btn.classList.add('text-green-400');
                    btn.title = 'Copied!';
                    btn.setAttribute('aria-label', 'Copied!');

                    setTimeout(() => {
                        btn.classList.remove('text-green-400');
                        btn.title = originalTitle;
                        btn.setAttribute('aria-label', originalTitle);
                        if (iconSpan) {
                            // Restore original icon (Copy)
                            iconSpan.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        }
                    }, 2000);

                }).catch(() => {
                    UI.showToast('Failed to copy', 'error');
                });
            } else {
                UI.showToast('No wildcards to copy', 'info');
            }
        }

        if (target.closest('.batch-delete-btn')) {
            const card = target.closest('.wildcard-card');
            if (!card) return;
            const checked = card.querySelectorAll('.batch-select:checked');
            if (checked.length === 0) {
                UI.showToast('No items selected', 'info');
                return;
            }

            const indices = Array.from(checked)
                .map(cb => parseInt(cb.closest('.chip').dataset.index))
                .sort((a, b) => b - a);

            if (indices.length > 0) {
                State.saveStateToHistory();
                const obj = State.getObjectByPath(path);
                indices.forEach(idx => {
                    obj.wildcards.splice(idx, 1);
                });
                UI.showToast(`Deleted ${indices.length} items`, 'success');
            }
        }

        if (target.closest('.select-all-btn')) {
            const card = target.closest('.wildcard-card');
            if (!card) return;
            const checkboxes = card.querySelectorAll('.batch-select');
            const btn = target.closest('.select-all-btn');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !allChecked);
            btn.textContent = allChecked ? 'Select All' : 'Deselect All';
        }
    },

    handleContainerChange(e) {
        if (e.target.matches('.custom-instructions-input')) {
            const path = e.target.closest('[data-path]').dataset.path;
            const obj = State.getObjectByPath(path);
            obj.instruction = e.target.value;
        }
    },

    handleContainerBlur(e) {
        if (e.target.matches('[contenteditable="true"]')) {
            const val = e.target.textContent.trim();
            const el = e.target.closest('[data-path]');
            if (!el) return;

            const path = el.dataset.path;

            if (e.target.closest('.chip')) {
                const index = e.target.closest('.chip').dataset.index;
                const obj = State.getObjectByPath(path);
                if (obj.wildcards[index] !== val) {
                    State.saveStateToHistory();
                    obj.wildcards[index] = val;
                }
            } else if (e.target.classList.contains('category-name') || e.target.classList.contains('wildcard-name')) {
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
                    parent[newKey] = content;
                } else {
                    e.target.textContent = oldKey.replace(/_/g, ' ');
                }
            }

            if (e.target.classList.contains('editable-name')) {
                e.target.removeAttribute('contenteditable');
            }

            if (e.target.classList.contains('editable-input')) {
                e.target.readOnly = true;
            }
        }
    },

    handleContainerKeydown(e) {
        if (e.key === 'Enter') {
            if (e.target.classList.contains('add-wildcard-input')) {
                e.preventDefault();
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
                        input.focus();
                    }
                }
                return;
            }

            if (e.target.isContentEditable) {
                e.preventDefault();
                e.target.blur();
            }
            if (e.target.tagName === 'INPUT' && !e.target.readOnly) {
                e.target.blur();
            }
        }
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

    enableEditing(el) {
        if (el.tagName === 'INPUT') {
            el.readOnly = false;
            el.focus();
            el.select();
        } else {
            el.setAttribute('contenteditable', 'true');
            el.focus();
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
                State.saveStateToHistory();
                const safeItems = newItems.map(item => (typeof item === 'object' && item !== null) ? (item.wildcard || item.text || item.value || JSON.stringify(item)) : String(item));
                obj.wildcards.push(...safeItems);
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
            UI.showToast(`Created "${name.trim()}"`, 'success');
        }, true);
    },

    async suggestItems(parentPath, type) {
        const parent = parentPath ? State.getObjectByPath(parentPath) : State.state.wildcards;
        if (!parent) {
            UI.showToast('Could not find parent category', 'error');
            return;
        }

        const existingStructure = Object.keys(parent).filter(k => k !== 'instruction' && k !== 'wildcards');

        UI.showToast('Generating suggestions...', 'info');

        try {
            const { suggestions } = await Api.suggestItems(
                parentPath,
                existingStructure,
                State.state.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT
            );

            if (!suggestions || suggestions.length === 0) {
                UI.showToast('No suggestions returned', 'info');
                return;
            }

            const dialogContent = `
				<div class="space-y-2">
					<div class="flex justify-between items-center mb-1">
                        <p class="text-xs text-gray-400">Select ${type === 'list' ? 'wildcard lists' : 'subcategories'} to add:</p>
                        <div class="flex gap-2">
                            <button id="suggest-select-all" class="text-xs text-indigo-400 hover:text-indigo-300">All</button>
                            <button id="suggest-select-none" class="text-xs text-indigo-400 hover:text-indigo-300">None</button>
                        </div>
                    </div>
					
					<div class="grid grid-cols-1 gap-1 max-h-[60vh] overflow-y-auto custom-scrollbar p-0.5">
						${suggestions.map((item, i) => {
                const name = (typeof item === 'object' && item.name) ? item.name : String(item);
                return `
							<label class="flex items-center gap-2 p-1.5 rounded bg-gray-700/40 hover:bg-indigo-900/40 border border-gray-600/30 hover:border-indigo-500/50 cursor-pointer transition-all group suggestion-item">
								<input type="checkbox" id="suggest-${i}" data-index="${i}" class="suggestion-checkbox w-3.5 h-3.5 text-indigo-500 bg-gray-800 border-gray-600 rounded focus:ring-1 focus:ring-indigo-500 cursor-pointer" checked>
								<span class="text-xs text-gray-300 group-hover:text-white truncate select-none" title="${name.replace(/_/g, ' ')}">${name.replace(/_/g, ' ')}</span>
							</label>
						`}).join('')}
					</div>

					<div class="flex justify-between items-center pt-2 border-t border-gray-700/50 mt-1">
						<span class="text-xs text-gray-500">${suggestions.length} suggestions found</span>
					</div>
				</div>
			`;

            UI.showNotification(dialogContent, true, () => {
                const checkboxes = document.querySelectorAll('.suggestion-checkbox:checked');
                const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
                const selectedSuggestions = selectedIndices.map(i => suggestions[i]);

                if (selectedSuggestions.length === 0) {
                    UI.showToast('No items selected', 'info');
                    return;
                }

                State.saveStateToHistory();
                selectedSuggestions.forEach(item => {
                    const name = item.name || item;
                    const key = String(name).trim().replace(/\s+/g, '_');
                    if (!parent[key]) {
                        if (type === 'list') {
                            parent[key] = { instruction: item.instruction || '', wildcards: [] };
                        } else {
                            parent[key] = { instruction: item.instruction || '' };
                        }
                    }
                });

                UI.showToast(`Added ${selectedSuggestions.length} ${type === 'list' ? 'lists' : 'categories'}`, 'success');
            });

            setTimeout(() => {
                document.getElementById('suggest-select-all')?.addEventListener('click', () => {
                    document.querySelectorAll('.suggestion-checkbox').forEach(cb => cb.checked = true);
                });
                document.getElementById('suggest-select-none')?.addEventListener('click', () => {
                    document.querySelectorAll('.suggestion-checkbox').forEach(cb => cb.checked = false);
                });
            }, 100);

        } catch (e) {
            console.error('Suggest items error:', e);
            UI.showNotification(`Failed to get suggestions: ${e.message}`);
        }
    }
};

