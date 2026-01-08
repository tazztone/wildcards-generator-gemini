import { UI } from './ui.js';

export const Config = {};

export async function loadConfig() {
    try {
        const response = await fetch('config/config.json');
        if (!response.ok) throw new Error('Could not fetch default configuration.');
        const defaultConfig = await response.json();

        const savedConfig = localStorage.getItem(defaultConfig.CONFIG_STORAGE_KEY);

        // Define defaults for user settings that are no longer in config.json
        const userDefaults = {
            API_URL_CUSTOM: "http://127.0.0.1:1234/v1",
            MODEL_NAME_GEMINI: "",
            MODEL_NAME_OPENROUTER: "",
            MODEL_NAME_CUSTOM: "",
            API_ENDPOINT: "openrouter",
            CUSTOM_SYSTEM_PROMPT: null,  // null = use default from config.json
            CUSTOM_SUGGEST_PROMPT: null,  // null = use default from config.json
            CUSTOM_TEMPLATE_PROMPT: null, // null = use default from config.json
            // View Mode Preference
            PREFERRED_VIEW: 'list',  // 'list', 'mindmap', or 'dual'
            // Advanced Model Defaults
            MODEL_TEMPERATURE: 0.7,
            MODEL_MAX_TOKENS: 1000,
            MODEL_TOP_P: 1.0,
            MODEL_TOP_K: 0,
            MODEL_FREQUENCY_PENALTY: 0.0,
            MODEL_PRESENCE_PENALTY: 0.0,
            MODEL_REPETITION_PENALTY: 1.0,
            MODEL_MIN_P: 0.0,
            MODEL_TOP_A: 0.0,
            MODEL_SEED: 0,
            MODEL_REASONING_EFFORT: 'default', // default, high, medium, low, none
            MODEL_REASONING_MAX_TOKENS: 0 // 0 = disabled
        };

        Object.assign(Config, defaultConfig, userDefaults, savedConfig ? JSON.parse(savedConfig) : {});

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
        const response = await fetch('config/config.json');
        if (!response.ok) throw new Error('Could not fetch default configuration for saving.');
        const defaultConfig = await response.json();

        // Include user defaults for comparison
        const userDefaults = {
            API_URL_CUSTOM: "http://127.0.0.1:1234/v1",
            MODEL_NAME_GEMINI: "",
            MODEL_NAME_OPENROUTER: "",
            MODEL_NAME_CUSTOM: "",
            API_ENDPOINT: "openrouter",
            CUSTOM_SYSTEM_PROMPT: null,
            CUSTOM_SUGGEST_PROMPT: null,
            CUSTOM_TEMPLATE_PROMPT: null,
            PREFERRED_VIEW: 'list',
            MODEL_TEMPERATURE: 0.7,
            MODEL_MAX_TOKENS: 1000,
            MODEL_TOP_P: 1.0,
            MODEL_TOP_K: 0,
            MODEL_FREQUENCY_PENALTY: 0.0,
            MODEL_PRESENCE_PENALTY: 0.0,
            MODEL_REPETITION_PENALTY: 1.0,
            MODEL_MIN_P: 0.0,
            MODEL_TOP_A: 0.0,
            MODEL_SEED: 0,
            MODEL_REASONING_EFFORT: 'default',
            MODEL_REASONING_MAX_TOKENS: 0
        };
        const allDefaults = { ...defaultConfig, ...userDefaults };

        const changedConfig = {};
        for (const key in Config) {
            // Skip runtime-only keys
            if (key.startsWith('API_KEY')) continue;

            // Save if it's a known config key AND it's different from default OR it's a new user setting
            if (Config.hasOwnProperty(key)) {
                // If present in defaults, check if changed
                if (allDefaults.hasOwnProperty(key)) {
                    if (JSON.stringify(Config[key]) !== JSON.stringify(allDefaults[key])) {
                        changedConfig[key] = Config[key];
                    }
                }
                // If it's a user setting loaded from storage (not in static defaults but valid config)
                else if (['API_URL_CUSTOM', 'MODEL_NAME_GEMINI', 'MODEL_NAME_OPENROUTER', 'MODEL_NAME_CUSTOM', 'API_ENDPOINT', 'CUSTOM_SYSTEM_PROMPT', 'CUSTOM_SUGGEST_PROMPT', 'CUSTOM_TEMPLATE_PROMPT', 'PREFERRED_VIEW',
                    'MODEL_TEMPERATURE', 'MODEL_MAX_TOKENS', 'MODEL_TOP_P', 'MODEL_TOP_K', 'MODEL_FREQUENCY_PENALTY', 'MODEL_PRESENCE_PENALTY', 'MODEL_REPETITION_PENALTY', 'MODEL_MIN_P', 'MODEL_TOP_A', 'MODEL_SEED',
                    'MODEL_REASONING_EFFORT', 'MODEL_REASONING_MAX_TOKENS'
                ].includes(key)) {
                    changedConfig[key] = Config[key];
                }
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

/**
 * Check if a setting is using its default value
 * @param {string} key - The config key to check
 * @returns {boolean} - True if using default, false if custom
 */
export function isUsingDefault(key) {
    if (key === 'CUSTOM_SYSTEM_PROMPT') {
        return Config.CUSTOM_SYSTEM_PROMPT === null;
    }
    if (key === 'CUSTOM_SUGGEST_PROMPT') {
        return Config.CUSTOM_SUGGEST_PROMPT === null;
    }
    if (key === 'CUSTOM_TEMPLATE_PROMPT') {
        return Config.CUSTOM_TEMPLATE_PROMPT === null;
    }
    if (key === 'API_ENDPOINT') {
        return Config.API_ENDPOINT === 'openrouter';
    }
    return false;
}

/**
 * Reset a setting to its default value
 * @param {string} key - The config key to reset
 */
export function resetToDefault(key) {
    if (key === 'CUSTOM_SYSTEM_PROMPT') {
        Config.CUSTOM_SYSTEM_PROMPT = null;
        saveConfig();
    } else if (key === 'CUSTOM_SUGGEST_PROMPT') {
        Config.CUSTOM_SUGGEST_PROMPT = null;
        saveConfig();
    } else if (key === 'CUSTOM_TEMPLATE_PROMPT') {
        Config.CUSTOM_TEMPLATE_PROMPT = null;
        saveConfig();
    } else if (key === 'API_ENDPOINT') {
        Config.API_ENDPOINT = 'openrouter';
        saveConfig();
    }
}

/**
 * Get the effective prompt value (custom if set, else default)
 * @param {string} key - 'system' or 'suggest'
 * @returns {string} - The prompt to use
 */
export function getEffectivePrompt(key) {
    if (key === 'system') {
        return Config.CUSTOM_SYSTEM_PROMPT !== null
            ? Config.CUSTOM_SYSTEM_PROMPT
            : Config.DEFAULT_SYSTEM_PROMPT;
    }
    if (key === 'suggest') {
        return Config.CUSTOM_SUGGEST_PROMPT !== null
            ? Config.CUSTOM_SUGGEST_PROMPT
            : Config.DEFAULT_SUGGEST_ITEM_PROMPT;
    }
    if (key === 'template') {
        return Config.CUSTOM_TEMPLATE_PROMPT !== null
            ? Config.CUSTOM_TEMPLATE_PROMPT
            : Config.DEFAULT_TEMPLATE_PROMPT;
    }
    return '';
}

/**
 * Set a custom prompt value
 * @param {string} key - 'system' or 'suggest'
 * @param {string} value - The new prompt value
 */
export function setCustomPrompt(key, value) {
    if (key === 'system') {
        // Check if value matches default
        if (value === Config.DEFAULT_SYSTEM_PROMPT) {
            Config.CUSTOM_SYSTEM_PROMPT = null;
        } else {
            Config.CUSTOM_SYSTEM_PROMPT = value;
        }
    } else if (key === 'suggest') {
        if (value === Config.DEFAULT_SUGGEST_ITEM_PROMPT) {
            Config.CUSTOM_SUGGEST_PROMPT = null;
        } else {
            Config.CUSTOM_SUGGEST_PROMPT = value;
        }
    } else if (key === 'template') {
        if (value === Config.DEFAULT_TEMPLATE_PROMPT) {
            Config.CUSTOM_TEMPLATE_PROMPT = null;
        } else {
            Config.CUSTOM_TEMPLATE_PROMPT = value;
        }
    }
    saveConfig();
}
