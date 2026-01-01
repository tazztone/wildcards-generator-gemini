import { UI } from './ui.js';

export const Config = {};

export async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) throw new Error('Could not fetch default configuration.');
        const defaultConfig = await response.json();

        const savedConfig = localStorage.getItem(defaultConfig.CONFIG_STORAGE_KEY);

        Object.assign(Config, defaultConfig, savedConfig ? JSON.parse(savedConfig) : {});

        // Initialize empty API keys - users enter keys via Settings panel
        // Check for persisted keys
        const loadKey = (keyName) => {
            const saved = localStorage.getItem(`wildcards_api_key_${keyName}`);
            if (saved) {
                try {
                    return atob(saved); // Simple obfuscation decode
                } catch (e) {
                    return '';
                }
            }
            return '';
        };

        Config.API_KEY_GEMINI = loadKey('gemini');
        Config.API_KEY_OPENROUTER = loadKey('openrouter');
        Config.API_KEY_CUSTOM = loadKey('custom');

    } catch (error) {
        console.error("Failed to load configuration:", error);
        // Fallback to minimal config
        Object.assign(Config, { STORAGE_KEY: 'wildcardGeneratorState_fallback', HISTORY_KEY: 'wildcardGeneratorHistory_fallback', HISTORY_LIMIT: 10 });
    }
}

export async function saveConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) throw new Error('Could not fetch default configuration for saving.');
        const defaultConfig = await response.json();

        const changedConfig = {};
        for (const key in Config) {
            if (key.startsWith('API_KEY')) continue;

            if (Config.hasOwnProperty(key) && defaultConfig.hasOwnProperty(key) && JSON.stringify(Config[key]) !== JSON.stringify(defaultConfig[key])) {
                changedConfig[key] = Config[key];
            }
        }

        localStorage.setItem(Config.CONFIG_STORAGE_KEY, JSON.stringify(changedConfig));
        if (UI && UI.showToast) UI.showToast('Configuration saved.', 'success');
    } catch (error) {
        console.error("Failed to save config:", error);
        if (UI && UI.showNotification) UI.showNotification(`Error saving configuration: ${error.message}`);
    }
}

export function updateConfigValue(key, value) {
    if (typeof value === 'number' && isNaN(value)) return;
    if (typeof value === 'string' && value.trim() === '') return;

    if (Config.hasOwnProperty(key)) {
        if (typeof Config[key] === 'number') {
            Config[key] = Number(value);
        } else {
            Config[key] = value;
        }
        saveConfig();
    }
}

export function saveApiKey(provider, key, persist) {
    const configKey = `API_KEY_${provider.toUpperCase()}`;
    Config[configKey] = key;

    const storageKey = `wildcards_api_key_${provider}`;
    if (persist) {
        localStorage.setItem(storageKey, btoa(key)); // Simple obfuscation
    } else {
        localStorage.removeItem(storageKey);
    }
}
