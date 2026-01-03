/**
 * Import/Export Module
 * Handles file I/O operations for YAML, ZIP, and Settings files.
 */

import { State } from '../state.js';
import { UI } from '../ui.js';
import { Config, saveConfig } from '../config.js';

export const ImportExport = {
    /**
     * Downloads content as a file.
     * @param {string} content - File content
     * @param {string} filename - Filename with extension
     * @param {string} mimeType - MIME type
     */
    _downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Exports all wildcards to a YAML file.
     */
    async handleExportYAML() {
        try {
            const YAML = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
            const yamlContent = YAML.stringify({
                wildcards: State.state.wildcards,
                systemPrompt: State.state.systemPrompt,
                suggestItemPrompt: State.state.suggestItemPrompt
            });
            this._downloadFile(yamlContent, 'wildcards.yaml', 'application/x-yaml');
            UI.showToast('YAML exported successfully', 'success');
        } catch (e) {
            console.error('Export YAML failed:', e);
            UI.showToast('Export failed', 'error');
        }
    },

    /**
     * Exports all wildcards as a ZIP archive with individual text files.
     */
    async handleExportZIP() {
        try {
            // Use globally loaded JSZip
            const zip = new window.JSZip();
            const wildcards = State.state.wildcards;

            /**
             * Recursively adds wildcard data to ZIP.
             * @param {object} data - Category/wildcard data
             * @param {string} prefix - File path prefix
             */
            const addToZip = (data, prefix = '') => {
                if (data.wildcards && Array.isArray(data.wildcards)) {
                    const content = data.wildcards.join('\n');
                    zip.file(`${prefix || 'root'}.txt`, content);
                }
                // Handle nested categories
                Object.keys(data).filter(k => k !== 'instruction' && k !== 'wildcards').forEach(key => {
                    const item = data[key];
                    if (typeof item === 'object' && item !== null) {
                        addToZip(item, prefix ? `${prefix}/${key}` : key);
                    }
                });
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

    /**
     * Exports application settings to a JSON file (excluding API keys for security).
     */
    handleExportSettings() {
        try {
            const settings = {
                _comment: "User settings for Wildcards Generator",
                apiEndpoint: Config.API_ENDPOINT,
                modelNameGemini: Config.MODEL_NAME_GEMINI,
                modelNameOpenrouter: Config.MODEL_NAME_OPENROUTER,
                modelNameCustom: Config.MODEL_NAME_CUSTOM,
                apiUrlCustom: Config.API_URL_CUSTOM,
                historyLimit: Config.HISTORY_LIMIT,
                searchDebounceDelay: Config.SEARCH_DEBOUNCE_DELAY
                // API Keys are intentionally NOT exported for security
            };
            const jsonContent = JSON.stringify(settings, null, 2);
            this._downloadFile(jsonContent, 'settings.json', 'application/json');
            UI.showToast('Settings exported successfully', 'success');
        } catch (e) {
            console.error('Export Settings failed:', e);
            UI.showToast('Export failed', 'error');
        }
    },

    /**
     * Opens a file picker to import YAML wildcard data.
     */
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

                // Check if merging is needed
                const hasExisting = Object.keys(State.state.wildcards).length > 0;
                if (hasExisting) {
                    UI.showNotification('Merge with existing data or replace everything?', true, () => {
                        // Replace mode (confirm = replace)
                        this._applyImportedData(data, file.name, 'replaced');
                    });
                } else {
                    this._applyImportedData(data, file.name, 'imported');
                }
            } catch (err) {
                console.error('Import YAML failed:', err);
                UI.showToast(`Import failed: ${err.message}`, 'error');
            }
        };
        input.click();
    },

    /**
     * Applies imported YAML data to state.
     * @param {object} data - Parsed YAML data
     * @param {string} filename - Original filename for toast message
     * @param {string} action - 'replaced' or 'imported' for toast
     */
    _applyImportedData(data, filename, action) {
        State.saveStateToHistory();
        if (data.wildcards) {
            State.state.wildcards = data.wildcards;
        } else {
            State.state.wildcards = data;
        }
        if (data.systemPrompt) State.state.systemPrompt = data.systemPrompt;
        if (data.suggestItemPrompt) State.state.suggestItemPrompt = data.suggestItemPrompt;
        UI.showToast(`Imported ${filename} (${action})`, 'success');
    },

    /**
     * Loads settings from a JSON file.
     * @param {Event} e - File input change event
     */
    async handleLoadSettings(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const config = JSON.parse(text);

            // Apply config values (with validation)
            if (config.apiEndpoint && typeof config.apiEndpoint === 'string') {
                Config.API_ENDPOINT = config.apiEndpoint;
            }
            if (config.modelNameGemini) Config.MODEL_NAME_GEMINI = config.modelNameGemini;
            if (config.modelNameOpenrouter) Config.MODEL_NAME_OPENROUTER = config.modelNameOpenrouter;
            if (config.modelNameCustom) Config.MODEL_NAME_CUSTOM = config.modelNameCustom;
            if (config.apiUrlCustom) Config.API_URL_CUSTOM = config.apiUrlCustom;
            if (typeof config.historyLimit === 'number' && config.historyLimit > 0) {
                Config.HISTORY_LIMIT = config.historyLimit;
            }
            if (typeof config.searchDebounceDelay === 'number' && config.searchDebounceDelay >= 0) {
                Config.SEARCH_DEBOUNCE_DELAY = config.searchDebounceDelay;
            }

            // Persist to storage
            saveConfig();

            // Update UI
            const endpointSelect = document.getElementById('api-endpoint');
            if (endpointSelect) endpointSelect.value = Config.API_ENDPOINT;
            UI.updateSettingsVisibility(Config.API_ENDPOINT);
            UI.renderApiSettings();

            // Reload page to ensure all settings take effect
            UI.showNotification('Settings loaded. Reloading page...', false);
            setTimeout(() => window.location.reload(), 1000);

        } catch (err) {
            console.error('Load Settings failed:', err);
            UI.showToast(`Import failed: ${err.message}`, 'error');
        }
        // Clear input so same file can be selected again
        e.target.value = '';
    },

    /**
     * Resets all settings to defaults (preserves wildcard data).
     */
    handleResetSettings() {
        UI.showNotification('Reset all settings and API keys? Wildcard data will stay.', true, () => {
            localStorage.removeItem(Config.CONFIG_STORAGE_KEY);
            localStorage.removeItem('wildcards_api_key_openrouter');
            localStorage.removeItem('wildcards_api_key_gemini');
            localStorage.removeItem('wildcards_api_key_custom');

            UI.showNotification('Settings reset. Reloading...', false);
            setTimeout(() => window.location.reload(), 1000);
        });
    }
};
