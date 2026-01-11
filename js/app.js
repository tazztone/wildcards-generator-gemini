import { State } from './state.js';
import { UI } from './ui.js';
import { Api } from './api.js';
import { Config, saveApiKey, saveConfig } from './config.js';
import { debounce } from './utils.js';
import { DragDrop } from './modules/drag-drop.js';
import { ImportExport } from './modules/import-export.js';
import { Settings } from './modules/settings.js';
import { Mindmap } from './modules/mindmap.js';
import { TemplateEngine } from './template-engine.js';

export const App = {
    draggedPath: null,
    lastCheckedBatch: null,

    async init() {
        UI.init();
        await State.init(); // This will trigger 'state-reset' which calls UI.renderAll()

        this.bindEvents();

        // Initial Theme
        const theme = localStorage.getItem('wildcards-theme') || 'dark';
        document.documentElement.className = theme;
        this.updateThemeIcon(theme);

        // Auto-verify stored keys
        setTimeout(() => Settings.verifyStoredApiKeys(), 500);

        // Restore view mode preference
        const preferredView = Config.PREFERRED_VIEW || 'list';

        // Ensure toggle button visual state matches default logic
        Mindmap.updateToggleButtonState();

        if (preferredView !== 'list') {
            // Defer to allow DOM to fully load
            setTimeout(() => Mindmap.setView(preferredView), 100);
        }

        // First Run Experience
        const hasVisited = localStorage.getItem('wildcards-visited');
        if (!hasVisited) {
            localStorage.setItem('wildcards-visited', 'true');
            // Trigger help dialog after a short delay to ensure UI is ready
            setTimeout(() => {
                const helpBtn = document.getElementById('help-btn');
                if (helpBtn) helpBtn.click();
            }, 1500);
        }
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

        // Prevent category toggle when clicking buttons or during editing mode
        // Also manually toggle when clicking readonly inputs (browsers block native toggle on <input>)
        UI.elements.container.addEventListener('click', (e) => {
            const summary = e.target.closest('summary');
            if (summary) {
                // Check if clicking on a button (pin, delete) or edit icon
                if (e.target.closest('.pin-btn') || e.target.closest('.delete-btn') || e.target.classList.contains('edit-icon')) {
                    e.preventDefault(); // Prevent toggle
                    return;
                }
                // Check if any element in summary is in editing mode
                const editableInEditMode = summary.querySelector('[contenteditable="true"]');
                // Only check editable-input class (text inputs), not checkboxes
                const inputInEditMode = summary.querySelector('.editable-input:not([readonly])');
                if (editableInEditMode || inputInEditMode) {
                    e.preventDefault(); // Prevent toggle while editing
                    return;
                }
                // If clicking on a readonly input, manually toggle the details
                // (Browsers prevent native toggle on interactive elements inside summary)
                const clickedInput = e.target.closest('.editable-input');
                if (clickedInput && clickedInput.readOnly) {
                    const details = summary.closest('details');
                    if (details) {
                        details.open = !details.open;
                    }
                    // Remove focus to avoid showing focus border on single click
                    clickedInput.blur();
                }
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

        // Drag and Drop - delegated to DragDrop module
        DragDrop.bindEvents(UI.elements.container);

        // Toolbar actions
        document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('undo-btn')?.addEventListener('click', () => State.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => State.redo());

        // Settings / API Keys
        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            const provider = /** @type {HTMLSelectElement} */ (e.target).value;
            Config.API_ENDPOINT = provider;
            saveConfig(); // Persist choice
            UI.updateSettingsVisibility(provider);
        });

        document.addEventListener('change', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.matches('.api-key-input') || target.matches('.api-key-remember')) {
                const panel = target.closest('.api-settings-panel');
                if (!panel) return;

                const keyInput = panel.querySelector('.api-key-input');
                const rememberCheck = /** @type {HTMLInputElement|null} */ (panel.querySelector('.api-key-remember'));
                if (!keyInput) return;

                const provider = keyInput.id.replace('-api-key', '');
                const persist = rememberCheck ? rememberCheck.checked : false;

                saveApiKey(provider, /** @type {HTMLInputElement} */(keyInput).value.trim(), persist);
            }

            // OpenRouter Filter Checkboxes
            if (target.id === 'openrouter-free-only' || target.id === 'openrouter-json-only') {
                UI.filterAndRenderModels('openrouter');
            }
        });

        document.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.matches('.test-conn-btn') || target.closest('.test-conn-btn')) {
                const btn = /** @type {HTMLButtonElement} */ (target.closest('.test-conn-btn') || target);
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
            if (target.matches('.test-model-btn') || target.closest('.test-model-btn')) {
                const btn = /** @type {HTMLButtonElement} */ (target.closest('.test-model-btn') || target);
                const provider = btn.dataset.provider;
                const panel = document.querySelector(`#settings-${provider}`);
                const apiKey = /** @type {HTMLInputElement|null} */ (panel?.querySelector('.api-key-input'))?.value?.trim();
                const modelName = /** @type {HTMLInputElement|null} */ (panel?.querySelector('.model-name-input'))?.value;
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
                    // New elements
                    const urlEl = document.getElementById('api-test-url');
                    const payloadEl = document.getElementById('api-test-payload');
                    const previewSection = document.getElementById('api-test-preview-section');
                    const previewEl = document.getElementById('api-test-preview');
                    const closeBtn = document.getElementById('api-test-close-btn');

                    // Reset state
                    previewSection.classList.add('hidden');
                    previewEl.innerHTML = '';

                    // Populate Common Data
                    timeEl.textContent = result.stats?.responseTime ? `${result.stats.responseTime} ms` : '-- ms';

                    // Populate Request Info
                    if (result.stats?.request) {
                        urlEl.textContent = result.stats.request.url;
                        try {
                            // Redact API Key in payload display for safety/screenshots
                            const safePayload = JSON.parse(JSON.stringify(result.stats.request.payload));
                            // Also check headers if we displayed them
                            payloadEl.textContent = JSON.stringify(safePayload, null, 2);
                        } catch (e) {
                            payloadEl.textContent = String(result.stats.request.payload);
                        }
                    } else {
                        urlEl.textContent = 'Unknown';
                        payloadEl.textContent = '--';
                    }

                    if (result.success) {
                        // Update stats in settings panel
                        if (statsEl) {
                            statsEl.textContent = `Last test: ${result.stats.responseTime}ms${result.stats.supportsJson ? ' ✓ JSON' : ''}`;
                            statsEl.classList.remove('hidden');
                        }

                        // JSON Status
                        jsonEl.textContent = `JSON: ${result.stats.supportsJson ? 'YES' : 'NO'}`;
                        jsonEl.className = `text-sm font-bold bg-gray-900/50 px-2 py-1 rounded border border-gray-700 ${result.stats.supportsJson ? 'text-green-400 border-green-900' : 'text-yellow-400 border-yellow-900'}`;
                        iconEl.textContent = '✅';

                        // Formatted Preview
                        if (result.stats.parsedContent && Array.isArray(result.stats.parsedContent)) {
                            previewSection.classList.remove('hidden');
                            previewEl.innerHTML = result.stats.parsedContent.map(item =>
                                `<span class="px-2 py-1 bg-indigo-900/50 text-indigo-200 border border-indigo-700/50 rounded text-xs">${item}</span>`
                            ).join('');
                        } else if (typeof result.stats.parsedContent === 'object') {
                            previewSection.classList.remove('hidden');
                            previewEl.innerHTML = `<span class="text-gray-400 text-xs italic">Result is an object, not an array. (Count: ${Object.keys(result.stats.parsedContent).length})</span>`;
                        }

                        // Raw Response
                        responseEl.textContent = result.stats.rawResponse;
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-green-300 custom-scrollbar whitespace-pre-wrap";
                    } else {
                        iconEl.textContent = '❌';
                        jsonEl.textContent = 'JSON: N/A';
                        jsonEl.className = "text-sm font-bold bg-gray-900/50 px-2 py-1 rounded border border-gray-700 text-gray-500";

                        responseEl.textContent = result.error;
                        responseEl.className = "bg-gray-950 p-3 rounded border border-gray-800 text-xs font-mono overflow-auto max-h-[300px] text-red-400 custom-scrollbar whitespace-pre-wrap";
                    }

                    /** @type {HTMLDialogElement} */ (dialog).showModal();

                    // Close handlers
                    const closeHandler = () => {
                        /** @type {HTMLDialogElement} */ (dialog).close();
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
            // Benchmark Button
            if (target.matches('.benchmark-btn') || target.closest('.benchmark-btn')) {
                const btn = /** @type {HTMLButtonElement} */ (target.closest('.benchmark-btn') || target);
                const provider = btn.dataset.provider;
                const panel = document.querySelector(`#settings-${provider}`);
                const apiKey = /** @type {HTMLInputElement|null} */ (panel?.querySelector('.api-key-input'))?.value?.trim();
                const modelName = /** @type {HTMLInputElement|null} */ (panel?.querySelector('.model-name-input'))?.value;

                if (!modelName?.trim()) {
                    UI.showToast('Please enter a model name first', 'warning');
                    return;
                }

                // Open benchmark dialog
                const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('benchmark-dialog'));
                const closeBtn = document.getElementById('benchmark-close-btn');

                // Reset all cards to pending state
                const phases = ['generate', 'suggestions', 'templates', 'dupeFinder'];
                phases.forEach(phase => {
                    const card = document.getElementById(`benchmark-card-${phase}`);
                    if (card) {
                        card.querySelector('.benchmark-status').textContent = '⏳';
                        card.querySelector('.benchmark-time').textContent = '-- ms';
                        card.querySelector('.check-json').textContent = '⬜';
                        card.querySelector('.check-schema').textContent = '⬜';
                        card.querySelector('.benchmark-preview').textContent = 'Waiting...';
                        card.classList.remove('border-green-500', 'border-red-500');
                        card.classList.add('border-gray-700');
                    }
                });

                document.getElementById('benchmark-total-time').textContent = 'Total: -- ms';
                document.getElementById('benchmark-summary').textContent = '--/4 passed';

                dialog.showModal();

                // Run benchmark with progress updates
                Api.runBenchmark(provider, apiKey, modelName, ({ phase, status, result }) => {
                    const card = document.getElementById(`benchmark-card-${phase}`);
                    if (!card) return;

                    if (status === 'running') {
                        card.querySelector('.benchmark-status').textContent = '🔄';
                        card.querySelector('.benchmark-preview').textContent = 'Testing...';
                    } else if (status === 'complete') {
                        const success = result?.success;
                        card.querySelector('.benchmark-status').textContent = success ? '✅' : '❌';
                        card.classList.remove('border-gray-700');
                        card.classList.add(success ? 'border-green-500' : 'border-red-500');

                        // Update time
                        const time = result?.stats?.responseTime ?? result?.responseTime ?? '??';
                        card.querySelector('.benchmark-time').textContent = `${time} ms`;

                        // Update checks
                        const supportsJson = result?.stats?.supportsJson ?? false;
                        const validSchema = result?.stats?.validSchema ?? result?.stats?.supportsJson ?? false;
                        card.querySelector('.check-json').textContent = supportsJson ? '✅' : '❌';
                        card.querySelector('.check-schema').textContent = validSchema ? '✅' : '❌';

                        // Update preview
                        const preview = card.querySelector('.benchmark-preview');
                        if (success && result?.stats?.parsedContent) {
                            const content = result.stats.parsedContent;
                            if (Array.isArray(content)) {
                                const items = content.slice(0, 3).map(item =>
                                    typeof item === 'string' ? item : (item?.name || JSON.stringify(item))
                                );
                                preview.textContent = items.join(', ') + (content.length > 3 ? ` (+${content.length - 3} more)` : '');
                            } else {
                                preview.textContent = JSON.stringify(content).slice(0, 100);
                            }
                        } else if (!success) {
                            preview.textContent = result?.error || 'Failed';
                            preview.classList.add('text-red-400');
                        }
                    }
                }).then((results) => {
                    // Store results for copy button
                    // @ts-ignore
                    dialog._benchmarkResults = {
                        provider,
                        model: modelName,
                        timestamp: new Date().toISOString(),
                        ...results
                    };

                    // Update summary
                    document.getElementById('benchmark-total-time').textContent = `Total: ${results.totalTime} ms`;
                    const summaryEl = document.getElementById('benchmark-summary');
                    summaryEl.textContent = `${results.passCount}/4 passed`;
                    summaryEl.classList.remove('text-green-400', 'text-red-400', 'text-yellow-400');
                    if (results.passCount === 4) {
                        summaryEl.classList.add('text-green-400');
                    } else if (results.passCount === 0) {
                        summaryEl.classList.add('text-red-400');
                    } else {
                        summaryEl.classList.add('text-yellow-400');
                    }
                });

                // Copy button handler
                const copyBtn = document.getElementById('benchmark-copy-btn');
                const copyHandler = async () => {
                    // @ts-ignore
                    const results = dialog._benchmarkResults;
                    if (!results) {
                        UI.showToast('No results to copy yet', 'warning');
                        return;
                    }
                    try {
                        // Format results for export (exclude request payloads for brevity)
                        const exportData = {
                            provider: results.provider,
                            model: results.model,
                            timestamp: results.timestamp,
                            totalTime: results.totalTime,
                            passed: results.passCount,
                            failed: results.failCount,
                            tests: {
                                generate: {
                                    success: results.generate?.success,
                                    responseTime: results.generate?.stats?.responseTime ?? results.generate?.responseTime,
                                    supportsJson: results.generate?.stats?.supportsJson ?? results.generate?.supportsJson,
                                    parsedCount: results.generate?.stats?.parsedCount ?? results.generate?.wildcards?.length,
                                    rawResponse: results.generate?.stats?.rawResponse ?? results.generate?.rawResponse
                                },
                                suggestions: {
                                    success: results.suggestions?.success,
                                    responseTime: results.suggestions?.stats?.responseTime,
                                    supportsJson: results.suggestions?.stats?.supportsJson,
                                    validSchema: results.suggestions?.stats?.validSchema,
                                    parsedCount: results.suggestions?.stats?.parsedCount,
                                    rawResponse: results.suggestions?.stats?.rawResponse
                                },
                                templates: {
                                    success: results.templates?.success,
                                    responseTime: results.templates?.stats?.responseTime,
                                    supportsJson: results.templates?.stats?.supportsJson,
                                    validSchema: results.templates?.stats?.validSchema,
                                    parsedCount: results.templates?.stats?.parsedCount,
                                    rawResponse: results.templates?.stats?.rawResponse
                                },
                                dupeFinder: {
                                    success: results.dupeFinder?.success,
                                    responseTime: results.dupeFinder?.stats?.responseTime,
                                    supportsJson: results.dupeFinder?.stats?.supportsJson,
                                    validSchema: results.dupeFinder?.stats?.validSchema,
                                    parsedCount: results.dupeFinder?.stats?.parsedCount,
                                    rawResponse: results.dupeFinder?.stats?.rawResponse
                                }
                            }
                        };
                        await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
                        UI.showToast('Benchmark results copied to clipboard', 'success');
                        copyBtn.textContent = '✓ Copied';
                        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
                    } catch (err) {
                        UI.showToast('Failed to copy results', 'error');
                    }
                };
                copyBtn.addEventListener('click', copyHandler);

                // Close handler
                const closeHandler = () => {
                    dialog.close();
                    closeBtn.removeEventListener('click', closeHandler);
                    copyBtn.removeEventListener('click', copyHandler);
                    dialog.removeEventListener('click', backdropHandler);
                };
                const backdropHandler = (e) => {
                    if (e.target === dialog) closeHandler();
                };
                closeBtn.addEventListener('click', closeHandler);
                dialog.addEventListener('click', backdropHandler);
            }
            // Help Button
            if (target.matches('#help-btn')) {
                UI.showNotification(`
<div class="text-left space-y-4 max-w-lg custom-scrollbar max-h-[70vh] overflow-y-auto pr-2">
    <section>
        <h3 class="text-xl font-bold text-indigo-300 flex items-center gap-2 mb-2">🚀 Getting Started</h3>
        <p class="text-xs text-gray-400 mb-3">Welcome to Wildcards Generator! This tool helps you manage and expand complex prompt libraries for AI image and text generation.</p>
        <ul class="list-none space-y-2 text-sm">
            <li class="flex items-start gap-2">
                <span class="text-indigo-400 mt-0.5">⚙️</span>
                <span><strong>API Setup:</strong> Click the gear icon to configure your AI provider (OpenRouter, Gemini, or Custom). You'll need an API key to use generation features.</span>
            </li>
            <li class="flex items-start gap-2">
                <span class="text-green-400 mt-0.5">📁</span>
                <span><strong>Organize:</strong> Click categories to expand them. You can drag and drop to reorder, nest categories, or move wildcards between lists.</span>
            </li>
            <li class="flex items-start gap-2">
                <span class="text-purple-400 mt-0.5">✨</span>
                <span><strong>AI Generation:</strong> Click the "Sparkle" button on any list to have the AI suggest new terms based on the existing ones.</span>
            </li>
        </ul>
    </section>

    <section class="border-t border-indigo-500/20 pt-3">
        <h3 class="text-lg font-bold text-indigo-300 flex items-center gap-2 mb-2">🧩 Templates & Automation</h3>
        <p class="text-xs text-gray-400 mb-2">The <code class="text-indigo-400">0_TEMPLATES</code> category is special. It powers the <strong>Hybrid Template System</strong>:</p>
        <ul class="text-sm text-gray-300 list-disc list-inside space-y-1">
            <li>Items here can use <code class="text-indigo-400">~~wildcard_name~~</code> syntax to reference other lists.</li>
            <li>Use the <strong>Analyze Categories</strong> button in settings to let AI tag your lists (e.g., "Subject", "Location").</li>
            <li>The system can then generate complex prompts by intelligently picking items from matching categories.</li>
        </ul>
    </section>

    <section class="border-t border-indigo-500/20 pt-3">
        <h3 class="text-lg font-bold text-indigo-300 mb-2">⌨️ Keyboard Shortcuts</h3>
        <div class="grid grid-cols-2 gap-2 text-sm bg-gray-900/40 rounded-lg p-3 border border-gray-800">
            <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+S</kbd> <span class="text-gray-500 ml-1">Save info</span></div>
            <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+Z</kbd> <span class="text-gray-500 ml-1">Undo</span></div>
            <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Ctrl+Y</kbd> <span class="text-gray-500 ml-1">Redo</span></div>
            <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">Escape</kbd> <span class="text-gray-500 ml-1">Collapse All</span></div>
            <div><kbd class="px-2 py-1 bg-gray-700 rounded text-xs">↑ / ↓</kbd> <span class="text-gray-500 ml-1">Navigate</span></div>
        </div>
    </section>

    <section class="border-t border-indigo-500/20 pt-3">
        <h3 class="text-lg font-bold text-indigo-300 mb-2">💡 Pro Tips</h3>
        <ul class="text-sm text-gray-300 list-disc list-inside space-y-1">
            <li><strong>Double-click</strong> any title or item to rename it instantly.</li>
            <li>Use <strong>Dupe Finder</strong> (toolbar) to find and merge repeated entries across your collection.</li>
            <li><strong>Pin</strong> categories via their header to keep your most-used lists at the top.</li>
            <li>Export your collection as <strong>ZIP</strong> to get a portable structure ready for use in Stable Diffusion.</li>
        </ul>
    </section>
</div>
`);
            }
            // Dupe Finder Mode
            if (target.closest('#dupe-finder-btn')) {
                UI.enterDupeFinderMode();
            }
            // Batch Select Mode Toggle
            if (target.closest('#batch-mode-btn')) {
                this.toggleBatchSelectMode(true);
            }
            // Exit Batch Select Mode
            if (target.closest('#exit-batch-mode-btn')) {
                this.toggleBatchSelectMode(false);
            }
            // Reset Options
            if (target.matches('#reset-localstorage')) {
                UI.showNotification('Clear all saved data from localStorage?\nThis includes remembered API keys and settings.', true, () => {
                    const keys = Object.keys(localStorage).filter(k => k.startsWith('wildcards'));
                    keys.forEach(k => localStorage.removeItem(k));
                    UI.showToast(`Cleared ${keys.length} localStorage items`, 'success');
                });
            }
            if (target.matches('#reset-sessionstorage')) {
                UI.showNotification('Clear session storage?\nThis includes temporary API keys and UI state.', true, () => {
                    const keys = Object.keys(sessionStorage).filter(k => k.startsWith('wildcards'));
                    keys.forEach(k => sessionStorage.removeItem(k));
                    UI.showToast(`Cleared ${keys.length} sessionStorage items`, 'success');
                });
            }
            if (target.matches('#reset-defaults')) {
                UI.showNotification('Reset everything to defaults?\n⚠️ This will clear all wildcards, settings, and history!', true, () => {
                    State.resetState();
                    UI.showToast('Reset to defaults complete', 'success');
                });
            }
            if (target.matches('#restore-defaults-btn')) {
                UI.showNotification('Reload default wildcard data?\nYour settings will be preserved.', true, async () => {
                    // UI.toggleOverflowMenu(false); // No longer needed as button is in settings
                    await State.resetState(); // Uses the fixed fetch('data/initial-data.yaml') in State.js
                    UI.renderAll(); // Force UI refresh to ensure new data is shown
                    UI.showToast('Default data reloaded', 'success');
                });
            }
            // Factory Reset
            if (target.matches('#factory-reset-btn')) {
                UI.showNotification('⚠️ Factory Reset? This will delete ALL wildcards and settings. Cannot be undone.', true, () => {
                    // UI.toggleOverflowMenu(false); // No longer needed
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                });
            }
            // Analyze Categories (Hybrid Template System)
            if (target.matches('#analyze-categories-btn')) {
                const btn = target;
                const iconEl = document.getElementById('analyze-btn-icon');
                const textEl = document.getElementById('analyze-btn-text');

                /** @type {HTMLButtonElement} */ (btn).disabled = true;
                iconEl.textContent = '⏳';
                textEl.textContent = 'Analyzing...';

                State.analyzeAllCategories((progress) => {
                    if (progress.stage === 'heuristics') {
                        textEl.textContent = 'Applying heuristics...';
                    } else if (progress.stage === 'llm') {
                        textEl.textContent = `LLM: ${progress.current}/${progress.total}`;
                    }
                }).then((result) => {
                    iconEl.textContent = '✅';
                    textEl.textContent = 'Analysis Complete';
                    document.getElementById('tags-count').textContent = `${result.heuristicCount + result.llmCount} tagged`;
                    document.getElementById('tags-status-badge')?.classList.add('hidden');
                    UI.showToast(`Analyzed ${result.totalCategories} categories (${result.heuristicCount} heuristic, ${result.llmCount} LLM)`, 'success');

                    setTimeout(() => {
                        iconEl.textContent = '🔍';
                        textEl.textContent = 'Analyze Categories';
                        /** @type {HTMLButtonElement} */ (btn).disabled = false;
                    }, 2000);
                }).catch(err => {
                    console.error('Analysis failed:', err);
                    iconEl.textContent = '❌';
                    textEl.textContent = 'Analysis Failed';
                    UI.showToast('Category analysis failed', 'error');
                    /** @type {HTMLButtonElement} */ (btn).disabled = false;
                });
            }
            // Test Hybrid Template Generation
            if (target.matches('#test-hybrid-gen-btn')) {
                const previewEl = document.getElementById('hybrid-gen-preview');
                const modeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('config-template-mode'));
                const mode = modeSelect?.value || 'wildcard';

                const readiness = TemplateEngine.checkReadiness();
                if (!readiness.canGenerate) {
                    previewEl.textContent = `⚠️ Cannot generate: Missing required roles. Run "Analyze Categories" first.\nMissing: ${readiness.missingRoles.join(', ')}`;
                    previewEl.classList.add('text-yellow-400');
                    return;
                }

                const templates = TemplateEngine.generate(5, /** @type {"wildcard"|"strict"|"hybrid"} */(mode));
                if (templates.length > 0) {
                    previewEl.textContent = templates.join('\n');
                    previewEl.classList.remove('text-yellow-400');
                } else {
                    previewEl.textContent = 'No templates generated. Check if categories are tagged.';
                    previewEl.classList.add('text-yellow-400');
                }
            }
            // Legacy reset button (if exists)
            if (target.matches('#reset-btn')) {
                UI.showNotification('Are you sure you want to reset everything?', true, () => State.resetState());
            }
            // Add Category Placeholder
            if (target.matches('#add-category-placeholder-btn')) {
                UI.showNotification('Enter new top-level category name:', true, (name) => {
                    if (name && name.trim()) {
                        const key = name.trim().replace(/\s+/g, '_');
                        if (State.state.wildcards[key]) { UI.showToast('Category already exists', 'error'); return; }
                        State.saveStateToHistory();
                        State.state.wildcards[key] = { _id: crypto.randomUUID().slice(0, 8), instruction: '' };
                        UI.showToast(`Created "${name.trim()}"`, 'success');
                    }
                }, true);
            }
            // Suggest Top-Level
            if (target.matches('#suggest-toplevel-btn')) {
                this.suggestItems(null, 'folder');
            }
            // Export YAML
            // Enhancement #7: Export Confirmation Feedback helper
            const showExportFeedback = (target) => {
                const btn = target.closest('button') || target;
                if (!btn) return;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '✓ Exported!';
                btn.classList.add('text-green-400');
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.classList.remove('text-green-400');
                }, 2000);
            };

            // Export YAML
            if (target.matches('#export-yaml') || target.closest('#export-yaml')) {
                ImportExport.handleExportYAML();
                showExportFeedback(target);
            }
            // Export ZIP
            if (target.matches('#download-all-zip') || target.closest('#download-all-zip')) {
                ImportExport.handleExportZIP();
                showExportFeedback(target);
            }
            // Settings Management Handlers (Modal)
            if (target.matches('#export-settings-btn')) {
                ImportExport.handleExportSettings();
            }
            if (target.matches('#load-settings-btn')) {
                document.getElementById('settings-file-input')?.click();
            }
            if (target.matches('#reset-settings-btn')) {
                ImportExport.handleResetSettings();
            }

            // Import YAML
            if (target.matches('#import-yaml')) {
                ImportExport.handleImportYAML();
            }

            // Batch Operations
            if (target.closest('#batch-expand')) this.handleBatchAction('expand');
            if (target.closest('#batch-collapse')) this.handleBatchAction('collapse');
            if (target.closest('#batch-delete')) this.handleBatchAction('delete');
            if (target.closest('#batch-generate')) this.handleBatchAction('generate');
            if (target.closest('#batch-suggest-folders')) this.handleBatchAction('suggest-folders');
            if (target.closest('#batch-suggest-lists')) this.handleBatchAction('suggest-lists');
        });

        // Settings File Input Handler
        document.getElementById('settings-file-input')?.addEventListener('change', (e) => ImportExport.handleLoadSettings(/** @type {Event & { target: HTMLInputElement }} */(e)));

        // Settings Management -> Reset Handlers
        // Batch Select All
        document.getElementById('batch-select-all')?.addEventListener('change', (e) => {
            const checked = /** @type {HTMLInputElement} */ (e.target).checked;
            document.querySelectorAll('.category-batch-checkbox, .card-batch-checkbox').forEach(cb => /** @type {HTMLInputElement} */(cb).checked = checked);
            this.lastCheckedBatch = null;
            this.updateBatchUI();
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // View Mode Selector Buttons
        document.getElementById('view-list')?.addEventListener('click', () => Mindmap.setView('list'));
        document.getElementById('view-mindmap')?.addEventListener('click', () => Mindmap.setView('mindmap'));
        document.getElementById('view-dual')?.addEventListener('click', () => Mindmap.setView('dual'));

        // Mindmap collapse/expand wildcards toggle
        document.getElementById('mindmap-toggle-wildcards')?.addEventListener('click', () => Mindmap.toggleWildcards());

        // Theme change observer for Mind Elixir sync
        const themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    // Sync Mind Elixir theme when app theme changes
                    if (Mindmap.instance) Mindmap.syncTheme(Mindmap.instance);
                    if (Mindmap.dualInstance) Mindmap.syncTheme(Mindmap.dualInstance);
                }
            });
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Mindmap AI action handlers
        document.addEventListener('mindmap-generate', (e) => {
            const { path } = /** @type {CustomEvent} */ (e).detail;
            if (path && path.length > 0) {
                const pathStr = path.join('/');
                this.handleGenerate(pathStr);
            }
        });

        document.addEventListener('mindmap-suggest', (e) => {
            const { path } = /** @type {CustomEvent} */ (e).detail;
            if (path && path.length > 0) {
                const pathStr = path.join('/');
                this.suggestItems(pathStr, 'list');
            }
        });
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
        // Arrow key navigation - Ignore if inside input/textarea unless it's Escape
        if (/** @type {HTMLElement} */(e.target).matches('input, textarea') && e.key !== 'Escape') return;

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
                /** @type {HTMLDetailsElement} */ (currentCategory).open = !/** @type {HTMLDetailsElement} */ (currentCategory).open;
            } else if (e.key === 'Escape') {
                categories.forEach(c => /** @type {HTMLDetailsElement} */(c).open = false);
                UI.showToast('All categories collapsed', 'info');
            }
        }
    },



    handleCheckDuplicates() {
        const { duplicates } = State.findDuplicates();

        if (duplicates.length === 0) {
            UI.showToast('No duplicates found!', 'success');
            return;
        }

        UI.showCheckDuplicatesDialog(duplicates);
    },

    handleBatchAction(action) {
        const selectedCheckboxes = document.querySelectorAll('.category-batch-checkbox:checked, .card-batch-checkbox:checked');
        if (selectedCheckboxes.length === 0) return;

        // Get all selected items (folders AND cards)
        const items = Array.from(selectedCheckboxes).map(cb => cb.closest('[data-path]'));
        // Separate them
        const folders = items.filter(el => el && el.tagName === 'DETAILS');
        // Cards are usually divs with wildcard-card class
        // const cards = items.filter(el => el && el.classList.contains('wildcard-card'));

        if (action === 'expand') {
            folders.forEach(cat => { if (cat) /** @type {HTMLDetailsElement} */(cat).open = true; });
            if (folders.length) UI.showToast(`Expanded ${folders.length} categories`, 'success');
        } else if (action === 'collapse') {
            folders.forEach(cat => { if (cat) /** @type {HTMLDetailsElement} */(cat).open = false; });
            if (folders.length) UI.showToast(`Collapsed ${folders.length} categories`, 'success');
        } else if (action === 'delete') {
            UI.showNotification(`Delete ${items.length} selected items?`, true, () => {
                State.saveStateToHistory();
                items.forEach(el => {
                    const path = /** @type {HTMLElement} */(el).dataset.path;
                    if (path) {
                        const parts = path.split('/');
                        const keyToDelete = parts.pop();
                        const parent = parts.length > 0 ? State.getObjectByPath(parts.join('/')) : State.state.wildcards;
                        if (parent) delete parent[keyToDelete];
                    }
                });
                UI.showToast(`Deleted ${items.length} items`, 'success');
            });
        } else if (action === 'generate') {
            // Can generate for both folders (recursive) and cards (direct)
            this.handleBatchGenerate(/** @type {HTMLElement[]} */(items));
        } else if (action === 'suggest-folders' || action === 'suggest-lists') {
            // Only for folders
            if (folders.length > 0) {
                this.handleBatchSuggest(/** @type {HTMLElement[]} */(folders), action === 'suggest-folders' ? 'folder' : 'list');
            } else {
                UI.showToast('Select categories to use suggestions', 'warning');
            }
        }
        /** @type {HTMLInputElement|null} */ (document.getElementById('batch-select-all')).checked = false;
        this.updateBatchUI();
    },

    updateBatchUI() {
        const selected = document.querySelectorAll('.category-batch-checkbox:checked, .card-batch-checkbox:checked');
        const count = selected.length;
        const countEl = document.getElementById('batch-count');
        if (countEl) countEl.textContent = `(${count} selected)`;

        const hasSelection = count > 0;

        // Button states
        const btns = {
            expand: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-expand')),
            collapse: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-collapse')),
            delete: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-delete')),
            generate: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-generate')),
            suggestFolders: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-suggest-folders')),
            suggestLists: /** @type {HTMLButtonElement|null} */ (document.getElementById('batch-suggest-lists'))
        };

        Object.values(btns).forEach(btn => { if (btn) btn.disabled = !hasSelection; });

        // Update titles to explain state (especially important for icons)
        if (btns.expand) btns.expand.title = hasSelection ? `Expand ${count} selected categories` : 'Select categories to expand';
        if (btns.collapse) btns.collapse.title = hasSelection ? `Collapse ${count} selected categories` : 'Select categories to collapse';
        if (btns.delete) btns.delete.title = hasSelection ? `Delete ${count} selected categories` : 'Select categories to delete';
        if (btns.generate) btns.generate.title = hasSelection ? `Generate content for wildcards inside ${count} categories` : 'Select categories to generate content';
        if (btns.suggestFolders) btns.suggestFolders.title = hasSelection ? `Suggest subfolders for ${count} categories` : 'Select categories to suggest subfolders';
        if (btns.suggestLists) btns.suggestLists.title = hasSelection ? `Suggest wildcard lists for ${count} categories` : 'Select categories to suggest lists';

        // The bar is shown/hidden by toggleBatchSelectMode, but we ensure it's visible if there's a selection
        if (hasSelection) document.getElementById('batch-ops-bar')?.classList.remove('hidden');
    },
    /**
     * Toggle batch select mode on/off
     * @param {boolean} enable - true to enter batch mode, false to exit
     */
    toggleBatchSelectMode(enable) {
        const body = document.body;
        const batchModeBtn = document.getElementById('batch-mode-btn');
        const batchOpsBar = document.getElementById('batch-ops-bar');

        if (enable) {
            body.classList.add('batch-select-mode');
            batchModeBtn?.classList.add('active');
            batchOpsBar?.classList.remove('hidden');

            // Clear any previous selection
            document.querySelectorAll('.category-batch-checkbox, .card-batch-checkbox').forEach(cb => {
                /** @type {HTMLInputElement} */(cb).checked = false;
            });
            const selectAll = /** @type {HTMLInputElement|null} */(document.getElementById('batch-select-all'));
            if (selectAll) selectAll.checked = false;

            UI.showToast('Batch Mode: Select categories for AI operations', 'info');
        } else {
            body.classList.remove('batch-select-mode');
            batchModeBtn?.classList.remove('active');

            // Clear all selections
            document.querySelectorAll('.category-batch-checkbox, .card-batch-checkbox').forEach(cb => {
                /** @type {HTMLInputElement} */(cb).checked = false;
            });
            const selectAll = /** @type {HTMLInputElement|null} */(document.getElementById('batch-select-all'));
            if (selectAll) selectAll.checked = false;

            batchOpsBar?.classList.add('hidden');
            this.lastCheckedBatch = null;
            UI.showToast('Exited Batch Mode', 'info');
        }

        this.updateBatchUI();
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

        if (placeholderElement) {
            const parentPath = placeholderElement.dataset.parentPath;
            if (target.matches('.add-wildcard-list-btn')) this.createItem(parentPath, 'list');
            if (target.matches('.add-subcategory-btn')) this.createItem(parentPath, 'folder');
            if (target.matches('.suggest-wildcard-list-btn')) this.suggestItems(parentPath, 'list');
            if (target.matches('.suggest-subcategory-btn')) this.suggestItems(parentPath, 'folder');
            return;
        }

        // Handle Batch Checkbox clicks (Cascade & Range Selection)
        if (target.matches('.category-batch-checkbox, .card-batch-checkbox')) {
            e.stopPropagation(); // Prevent details toggle
            const isChecked = target.checked;

            // Cascade logic for folders
            if (target.classList.contains('category-batch-checkbox')) {
                const details = target.closest('details');
                if (details) {
                    details.querySelectorAll('.category-batch-checkbox, .card-batch-checkbox').forEach(cb => {
                        /** @type {HTMLInputElement} */(cb).checked = isChecked;
                    });
                }
            }

            // Range selection logic (SHIFT+Click)
            if (e.shiftKey && this.lastCheckedBatch && this.lastCheckedBatch !== target) {
                const allCheckboxes = Array.from(document.querySelectorAll('.category-batch-checkbox:not(.hidden), .card-batch-checkbox:not(.hidden)'));
                const startIdx = allCheckboxes.indexOf(this.lastCheckedBatch);
                const endIdx = allCheckboxes.indexOf(target);

                if (startIdx !== -1 && endIdx !== -1) {
                    const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                    for (let i = min; i <= max; i++) {
                        /** @type {HTMLInputElement} */(allCheckboxes[i]).checked = isChecked;
                    }
                }
            }

            this.lastCheckedBatch = target;
            this.updateBatchUI();
            return;
        }

        // Chip click for selection toggle (anywhere on chip, including text)
        // Double-click-to-edit is handled by a separate dblclick handler
        // Exclude add-chip-btn which has its own handler
        if (target.closest('.chip') && target.closest('.chip-container') && !target.closest('.add-chip-btn')) {
            const chip = target.closest('.chip');
            chip.classList.toggle('selected');
            chip.setAttribute('aria-checked', chip.classList.contains('selected') ? 'true' : 'false');
            this.updateSelectionButtonsState(target.closest('.wildcard-card'));
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

        // Add Chip Button - reveals the input row
        if (target.closest('.add-chip-btn')) {
            const card = target.closest('.wildcard-card');
            const inputRow = card?.querySelector('.add-input-row');
            const addBtn = target.closest('.add-chip-btn');
            if (inputRow) {
                inputRow.classList.remove('hidden');
                addBtn?.classList.add('hidden');
                const input = inputRow.querySelector('.add-wildcard-input');
                input?.focus();
            }
            return;
        }

        // Cancel Add Button - hides the input row
        if (target.closest('.cancel-add-btn')) {
            const card = target.closest('.wildcard-card');
            const inputRow = card?.querySelector('.add-input-row');
            const addChipBtn = card?.querySelector('.add-chip-btn');
            if (inputRow) {
                inputRow.classList.add('hidden');
                const input = inputRow.querySelector('.add-wildcard-input');
                if (input) input.value = '';
            }
            addChipBtn?.classList.remove('hidden');
            return;
        }

        // Add Wildcard
        if (target.closest('.add-wildcard-btn')) {
            const input = pathElement.querySelector('.add-wildcard-input');
            if (input && input.value.trim()) {
                State.saveStateToHistory();
                const obj = State.getObjectByPath(path);
                obj.wildcards.push(input.value.trim());
                input.value = '';
                // Hide input row after adding
                const card = target.closest('.wildcard-card');
                const inputRow = card?.querySelector('.add-input-row');
                const addChipBtn = card?.querySelector('.add-chip-btn');
                inputRow?.classList.add('hidden');
                addChipBtn?.classList.remove('hidden');
            }
        }

        // Generate More
        if (target.closest('.generate-btn')) {
            this.handleGenerate(path);
        }

        // Copy all wildcards
        if (target.closest('.copy-btn')) {
            const btn = target.closest('.copy-btn');
            const card = target.closest('.wildcard-card');
            const selectedChips = card.querySelectorAll('.chip.selected');
            const obj = State.getObjectByPath(path);

            if (obj && obj.wildcards && obj.wildcards.length > 0) {
                // If selection exists, copy selected only. Ensure we map indices correctly.
                let text;
                if (selectedChips.length > 0) {
                    text = Array.from(selectedChips).map(chip => chip.textContent.trim()).join(', ');
                } else {
                    // Fallback/Safety
                    text = obj.wildcards.join(', ');
                }
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

        // Card Batch Actions
        if (target.closest('.batch-delete-btn')) {
            const card = target.closest('.wildcard-card');
            if (!card) return;
            const checked = card.querySelectorAll('.chip.selected');
            if (checked.length === 0) {
                UI.showToast('No items selected', 'info');
                return;
            }

            // Delete selected items
            // Must delete in descending order of index to preserve indices of earlier items during splice
            const indices = Array.from(checked)
                .map(chip => parseInt(chip.dataset.index))
                .sort((a, b) => b - a);

            if (indices.length > 0) {
                State.saveStateToHistory();
                const obj = State.getObjectByPath(path);
                indices.forEach(idx => {
                    obj.wildcards.splice(idx, 1);
                });
                // Proxy will trigger update
                UI.showToast(`Deleted ${indices.length} items`, 'success');
            }
        }

        if (target.closest('.select-all-btn')) {
            const card = target.closest('.wildcard-card');
            if (!card) return;
            const chips = card.querySelectorAll('.chip');
            const btn = target.closest('.select-all-btn');
            // If any is not selected, select all. If all selected, deselect all.
            const allSelected = Array.from(chips).every(chip => chip.classList.contains('selected'));
            chips.forEach(chip => {
                if (allSelected) {
                    chip.classList.remove('selected');
                    chip.setAttribute('aria-checked', 'false');
                } else {
                    chip.classList.add('selected');
                    chip.setAttribute('aria-checked', 'true');
                }
            });
            // Update button icon and title
            btn.textContent = allSelected ? '☑' : '☐';
            btn.title = allSelected ? 'Select All' : 'Deselect All';
            this.updateSelectionButtonsState(card);
        }
    },

    updateSelectionButtonsState(card) {
        if (!card) return;
        const selectedCount = card.querySelectorAll('.chip.selected').length;
        const copyBtn = card.querySelector('.copy-btn');
        const deleteBtn = card.querySelector('.batch-delete-btn');

        if (copyBtn) {
            if (selectedCount > 0) {
                copyBtn.classList.remove('hidden');
                copyBtn.title = `Copy ${selectedCount} selected`;
            } else {
                copyBtn.classList.add('hidden');
            }
        }

        if (deleteBtn) {
            if (selectedCount > 0) {
                deleteBtn.classList.remove('hidden');
                deleteBtn.title = `Delete ${selectedCount} selected`;
            } else {
                deleteBtn.classList.add('hidden');
            }
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

    async handleContainerKeydown(e) {
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

        // Delete key for selected chips
        if (e.key === 'Delete') {
            // Only proceed if not editing text (input or contenteditable)
            if (e.target.isContentEditable || (e.target.tagName === 'INPUT' && !e.target.readOnly)) {
                return;
            }

            const selectedChips = document.querySelectorAll('.chip.selected');
            if (selectedChips.length > 0) {
                e.preventDefault();
                const confirmed = await UI.showConfirmDialog(
                    'Delete Items',
                    `Are you sure you want to delete ${selectedChips.length} selected item(s)?`,
                    {
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        danger: true,
                        rememberKey: 'wildcards_confirm_delete_chips'
                    }
                );

                if (confirmed) {
                    State.saveStateToHistory();

                    // Group deletions by path to minimize re-renders
                    const deletions = {};

                    selectedChips.forEach(chip => {
                        const card = chip.closest('.card-wildcard');
                        if (!card) return;
                        const path = /** @type {HTMLElement} */ (card).dataset.path;
                        const index = parseInt(/** @type {HTMLElement} */(chip).dataset.index);

                        if (!deletions[path]) deletions[path] = [];
                        deletions[path].push(index);
                    });

                    // Perform deletions
                    Object.keys(deletions).forEach(path => {
                        const indices = deletions[path].sort((a, b) => b - a); // Delete highest index first
                        const obj = State.getObjectByPath(path);
                        if (obj && Array.isArray(obj.wildcards)) {
                            indices.forEach(idx => obj.wildcards.splice(idx, 1));
                            // Trigger update - assigning to array directly or via proxy handler would be best
                            // Since we modified array in place, we might need to trigger generic update or depend on proxy
                            // Assuming proxy handles splice, but we need to trigger the set trap logic for UI update.
                            // Re-assigning the array is the safest way to trigger the full update for that path.
                            obj.wildcards = [...obj.wildcards];
                        }
                    });

                    UI.showToast(`Deleted ${selectedChips.length} items`);
                }
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

        // Template generation flow - detect if inside 0_TEMPLATES
        if (State.isTemplateCategory(path)) {
            const wildcardPaths = State.getAllWildcardPaths();
            if (wildcardPaths.length < 2) {
                UI.showToast('Need at least 2 wildcard lists to generate templates', 'warning');
                return;
            }

            UI.showTemplateSourcesDialog(wildcardPaths, async (selectedPaths, useAllTagged) => {
                if (!useAllTagged && selectedPaths.length < 2) {
                    UI.showToast('Select at least 2 categories', 'warning');
                    return;
                }
                UI.elements.dialog.close();
                await this.executeTemplateGeneration(path, obj, selectedPaths, useAllTagged);
            });
            return;
        }

        UI.toggleLoader(path, true);

        // Enhancement #3: Update button text during loading
        const pathElement = document.querySelector(`[data-path="${path}"]`);
        const generateBtn = pathElement?.querySelector('.generate-btn .btn-text');
        const originalText = generateBtn?.textContent || 'Generate More';
        if (generateBtn) generateBtn.textContent = 'Generating...';

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
                // Ensure we only push strings
                const safeItems = newItems.map(item => (typeof item === 'object' && item !== null) ? (item.wildcard || item.text || item.value || JSON.stringify(item)) : String(item));
                obj.wildcards.push(...safeItems);
                // Sort logic is now handled in the state proxy trap.
                UI.showToast(`Generated ${newItems.length} items`, 'success');
            }
        } catch (e) {
            UI.showNotification(e.message);
        } finally {
            UI.toggleLoader(path, false);
            // Restore original button text
            if (generateBtn) generateBtn.textContent = originalText;
        }
    },

    /**
     * Execute template generation with selected category paths.
     * @param {string} path - The template wildcard list path
     * @param {object} obj - The wildcard list object
     * @param {string[]} selectedPaths - Selected category paths for template generation
     */
    async executeTemplateGeneration(path, obj, selectedPaths, useAllTagged = false) {
        UI.toggleLoader(path, true);

        // Check if using Hybrid Engine
        if (Config.USE_HYBRID_ENGINE) {
            try {
                const { TemplateEngine } = await import('./template-engine.js');
                const readiness = TemplateEngine.checkReadiness();

                if (!readiness.canGenerate) {
                    UI.showToast('Hybrid engine not ready. Run "Analyze Categories" in Settings first.', 'warning');
                    UI.toggleLoader(path, false);
                    return;
                }

                const generateBtn = document.querySelector(`[data-path="${path}"] .generate-btn .btn-text`);
                if (generateBtn) generateBtn.textContent = 'Generating...';

                // Wait a tick to show loading state
                await new Promise(resolve => setTimeout(resolve, 50));

                const mode = Config.TEMPLATE_MODE || 'wildcard';
                // If user unchecked "use all", filter roleIndex by selectedPaths
                const options = useAllTagged ? {} : { filterPaths: selectedPaths };

                const templates = TemplateEngine.generate(10, mode, options);

                if (templates.length > 0) {
                    State.saveStateToHistory();
                    obj.wildcards.push(...templates);
                    UI.showToast(`Generated ${templates.length} templates (Hybrid)`, 'success');
                } else {
                    UI.showToast('No templates generated. Check category tags.', 'warning');
                }
            } catch (error) {
                console.error('Hybrid generation failed:', error);
                UI.showNotification(`Hybrid generation failed: ${error.message}`);
            } finally {
                UI.toggleLoader(path, false);
                const generateBtn = document.querySelector(`[data-path="${path}"] .generate-btn .btn-text`);
                if (generateBtn) generateBtn.textContent = 'Generate Templates';
            }
            return;
        }

        const pathElement = document.querySelector(`[data-path="${path}"]`);
        const generateBtn = pathElement?.querySelector('.generate-btn .btn-text');
        if (generateBtn) generateBtn.textContent = 'Generating...';

        try {
            const pathMap = State.buildPathMap(selectedPaths);
            // Dynamic import to avoid circular dependency issues if Config imports App
            const { getEffectivePrompt } = await import('./config.js');
            const templatePrompt = getEffectivePrompt('template');
            const instructions = obj.instruction || 'Generate creative scene templates combining the selected categories';

            const templates = await Api.generateTemplates(pathMap, instructions, templatePrompt);

            if (templates && templates.length > 0) {
                State.saveStateToHistory();
                obj.wildcards.push(...templates);
                UI.showToast(`Generated ${templates.length} templates`, 'success');
            } else {
                UI.showToast('No valid templates generated', 'info');
            }
        } catch (e) {
            console.error('Template generation error:', e);
            UI.showNotification(`Template generation failed: ${e.message}`);
        } finally {
            UI.toggleLoader(path, false);
            if (generateBtn) generateBtn.textContent = 'Generate Templates';
        }
    },

    createItem(parentPath, type) {
        UI.showNotification(`Enter name for new ${type}:`, true, (name) => {
            if (!name) return;
            const key = name.trim().replace(/\s+/g, '_');
            const parent = State.getObjectByPath(parentPath);
            if (parent[key]) { UI.showToast('Exists already', 'error'); return; }

            State.saveStateToHistory();
            parent[key] = type === 'list'
                ? { _id: crypto.randomUUID().slice(0, 8), instruction: '', wildcards: [] }
                : { _id: crypto.randomUUID().slice(0, 8), instruction: '' };
            UI.showToast(`Created "${name.trim()}"`, 'success');
        }, true);
    },

    async suggestItems(parentPath, type) {
        // Get parent object and existing structure
        const parent = parentPath ? State.getObjectByPath(parentPath) : State.state.wildcards;
        if (!parent) {
            UI.showToast('Could not find parent category', 'error');
            return;
        }

        // Get existing sibling names for context
        const existingStructure = Object.keys(parent).filter(k => k !== 'instruction' && k !== 'wildcards');

        UI.showToast('Generating suggestions...', 'info');

        try {
            const { suggestions, request } = await Api.suggestItems(
                parentPath,
                existingStructure,
                State.state.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT,
                (parent && parent.instruction) || ''
            );

            if (!suggestions || suggestions.length === 0) {
                UI.showToast('No suggestions returned', 'info');
                return;
            }

            // Build selection dialog HTML - compact styling (Densified)
            const dialogContent = `
				<div class="space-y-2">
					<div class="flex justify-between items-center mb-1">
                        <p class="text-xs text-gray-400">Select ${type === 'list' ? 'wildcard lists' : 'subcategories'} to add:</p>
                        <div class="flex gap-2">
                            <button id="suggest-select-all" class="text-xs text-indigo-400 hover:text-indigo-300">All</button>
                            <button id="suggest-select-none" class="text-xs text-indigo-400 hover:text-indigo-300">None</button>
                        </div>
                    </div>
					
					<div class="grid grid-cols-1 gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar p-0.5">
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

                    <details class="text-xs text-gray-500 mt-2 border-t border-gray-700/50 pt-2">
                        <summary class="cursor-pointer hover:text-gray-300 select-none font-semibold">Raw Request Data</summary>
                        <pre class="mt-2 p-2 bg-gray-900 rounded overflow-x-auto text-gray-400 font-mono text-[10px] w-full max-h-40 custom-scrollbar">${JSON.stringify(request, null, 2)}</pre>
                    </details>
				</div>
			`;

            UI.showNotification(dialogContent, true, () => {
                // Get selected suggestions
                const checkboxes = document.querySelectorAll('.suggestion-checkbox:checked');
                const selectedIndices = Array.from(checkboxes).map(cb => parseInt(/** @type {HTMLElement} */(cb).dataset.index ?? '0'));
                const selectedSuggestions = selectedIndices.map(i => suggestions[i]);

                if (selectedSuggestions.length === 0) {
                    UI.showToast('No items selected', 'info');
                    return;
                }

                // Add selected items to state
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

            // Bind Select All/None helpers inside the dialog
            setTimeout(() => {
                document.getElementById('suggest-select-all')?.addEventListener('click', () => {
                    document.querySelectorAll('.suggestion-checkbox').forEach(cb => /** @type {HTMLInputElement} */(cb).checked = true);
                });
                document.getElementById('suggest-select-none')?.addEventListener('click', () => {
                    document.querySelectorAll('.suggestion-checkbox').forEach(cb => /** @type {HTMLInputElement} */(cb).checked = false);
                });
            }, 100);

        } catch (e) {
            console.error('Suggest items error:', e);
            UI.showNotification(`Failed to get suggestions: ${e.message}`);
        }
    },
    // Drag-and-drop functionality is now in js/modules/drag-drop.js
    // Import/export functionality is now in js/modules/import-export.js
    // Settings verification is now in js/modules/settings.js

    async handleBatchGenerate(categories) {
        const tasks = [];
        // Find all wildcard lists recursively
        const collectLists = (obj, currentPath) => {
            if (obj.wildcards && Array.isArray(obj.wildcards)) {
                tasks.push({ path: currentPath, count: obj.wildcards.length });
            } else {
                Object.keys(obj).forEach(key => {
                    if (key !== 'instruction' && typeof obj[key] === 'object') {
                        collectLists(obj[key], `${currentPath}/${key}`);
                    }
                });
            }
        };

        categories.forEach(cat => {
            if (cat && cat.dataset.path) {
                const path = cat.dataset.path;
                const obj = State.getObjectByPath(path);
                if (obj) collectLists(obj, path);
            }
        });

        if (tasks.length === 0) {
            UI.showToast('No wildcard lists found in selected categories', 'info');
            return;
        }

        UI.showNotification(`Found ${tasks.length} wildcard lists.\nGenerate content for all of them?`, true, async () => {
            UI.showToast('Starting batch generation...', 'info');

            // Execute sequentially to be nice to API
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const cleanName = task.path.split('/').pop().replace(/_/g, ' ');
                UI.showToast(`Generating for "${cleanName}" (${i + 1}/${tasks.length})...`, 'info');

                // Scroll to item
                const card = document.querySelector(`.wildcard-card[data-path="${task.path}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Expand parents if hidden? ensure visibility
                }

                await this.handleGenerate(task.path);

                // Small delay between requests
                await new Promise(r => setTimeout(r, 500));
            }
            UI.showToast('Batch generation complete!', 'success');
        });
    },

    async handleBatchSuggest(categories, type) {
        UI.showNotification(`Suggest ${type === 'folder' ? 'sub-folders' : 'wildcard lists'} for ${categories.length} selected categories?`, true, async () => {

            UI.showToast('Generating suggestions batch...', 'info');
            const allResults = [];

            // 1. Fetch suggestions for all categories
            for (let i = 0; i < categories.length; i++) {
                const cat = categories[i];
                if (!cat.dataset.path) continue;
                const path = cat.dataset.path;
                const parent = State.getObjectByPath(path);
                if (!parent) continue;

                const cleanName = path.split('/').pop().replace(/_/g, ' ');
                const existingStructure = Object.keys(parent).filter(k => k !== 'instruction' && k !== 'wildcards');

                try {
                    const { suggestions, request } = await Api.suggestItems(
                        path,
                        existingStructure,
                        State.state.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT
                    );
                    if (suggestions && suggestions.length > 0) {
                        allResults.push({ path, name: cleanName, suggestions, parent, request });
                    }
                } catch (e) {
                    console.error(`Failed to suggest for ${path}`, e);
                }
            }

            if (allResults.length === 0) {
                UI.showToast('No suggestions returned', 'info');
                return;
            }

            // 2. Build Combined Selection Dialog
            // We need a way to map checkboxes back to specific suggestions.
            // unique ID: "batch-suggest-${resultIndex}-${suggestionIndex}"

            const dialogContent = `
				<div class="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-xs text-gray-400">Review suggestions for ${allResults.length} categories:</p>
                        <div class="flex gap-2">
                             <button id="batch-suggest-select-all" class="text-xs text-indigo-400 hover:text-indigo-300">All</button>
                             <button id="batch-suggest-select-none" class="text-xs text-indigo-400 hover:text-indigo-300">None</button>
                        </div>
                    </div>

                    ${allResults.map((result, rIdx) => `
                        <div class="bg-gray-800/50 rounded p-2 border border-gray-700/50">
                            <h4 class="font-bold text-gray-300 text-sm mb-2 sticky top-0 bg-gray-800/90 py-1">${result.name}</h4>
                            <div class="grid grid-cols-1 gap-1">
                                ${result.suggestions.map((item, sIdx) => {
                const name = (typeof item === 'object' && item.name) ? item.name : String(item);
                return `
                                    <label class="flex items-center gap-2 p-1 rounded hover:bg-indigo-900/30 cursor-pointer">
                                        <input type="checkbox" 
                                            class="batch-suggestion-checkbox w-3.5 h-3.5 text-indigo-500 bg-gray-800 border-gray-600 rounded" 
                                            data-result-index="${rIdx}" 
                                            data-suggestion-index="${sIdx}"
                                            checked>
                                        <span class="text-xs text-gray-400 select-none">${name.replace(/_/g, ' ')}</span>
                                    </label>
                                    `;
            }).join('')}
                            </div>
                        </div>
                    `).join('')}

					<div class="flex justify-between items-center pt-2 border-t border-gray-700/50 mt-1">
						<span class="text-xs text-gray-500">Total ${allResults.reduce((acc, r) => acc + r.suggestions.length, 0)} suggestions</span>
					</div>

                    <details class="text-xs text-gray-500 mt-2 border-t border-gray-700/50 pt-2">
                        <summary class="cursor-pointer hover:text-gray-300 select-none font-semibold">Raw Request Data (Batch)</summary>
                        <pre class="mt-2 p-2 bg-gray-900 rounded overflow-x-auto text-gray-400 font-mono text-[10px] w-full max-h-40 custom-scrollbar">${JSON.stringify(allResults.map(r => r.request), null, 2)}</pre>
                    </details>
				</div>
			`;

            UI.showNotification(dialogContent, true, () => {
                // 3. Process Selection
                const checkboxes = document.querySelectorAll('.batch-suggestion-checkbox:checked');
                if (checkboxes.length === 0) {
                    UI.showToast('No items selected', 'info');
                    return;
                }

                State.saveStateToHistory();
                let addedCount = 0;

                checkboxes.forEach(cb => {
                    const rIdx = parseInt(/** @type {HTMLElement} */(cb).dataset.resultIndex);
                    const sIdx = parseInt(/** @type {HTMLElement} */(cb).dataset.suggestionIndex);

                    const result = allResults[rIdx];
                    const item = result.suggestions[sIdx];
                    const parent = result.parent;

                    const name = item.name || item;
                    const key = String(name).trim().replace(/\s+/g, '_');

                    if (!parent[key]) {
                        if (type === 'list') {
                            parent[key] = { instruction: item.instruction || '', wildcards: [] };
                        } else {
                            parent[key] = { instruction: item.instruction || '' };
                        }
                        addedCount++;
                    }
                });

                UI.showToast(`Batch added ${addedCount} items across ${allResults.length} categories`, 'success');
            });

            // Bind helpers
            setTimeout(() => {
                document.getElementById('batch-suggest-select-all')?.addEventListener('click', () => {
                    document.querySelectorAll('.batch-suggestion-checkbox').forEach(cb => /** @type {HTMLInputElement} */(cb).checked = true);
                });
                document.getElementById('batch-suggest-select-none')?.addEventListener('click', () => {
                    document.querySelectorAll('.batch-suggestion-checkbox').forEach(cb => /** @type {HTMLInputElement} */(cb).checked = false);
                });
            }, 100);
        });
    }
};

