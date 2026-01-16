import { UI } from './ui.js';
import { encrypt } from './crypto.js';

// TODO: Add config schema validation on load to catch corrupted data
// TODO: Implement config versioning with automatic migration on version bumps
// TODO: Add config diff/export for debugging user issues

// Hardcoded defaults as Single Source of Truth for structure and prompts
const CONFIG_CONSTANTS = {
    CONFIG_STORAGE_KEY: "wildcardGeneratorConfig_v1",
    STORAGE_KEY: "wildcardGeneratorState_v12",
    HISTORY_KEY: "wildcardGeneratorHistory_v12",
    HISTORY_LIMIT: 50,
    SEARCH_DEBOUNCE_DELAY: 700,
    DEFAULT_SYSTEM_PROMPT: "You are a creative assistant for generating wildcards for AI image prompts. You will be given a category path, a list of existing wildcards, and optional custom instructions. Your task is to generate 20 more diverse and creative wildcards that fit the category. Do not repeat any from the existing list. Follow all custom instructions. Return ONLY the new wildcards as a JSON array of strings. Ensure that your response is a valid JSON array of strings, containing exactly 20 unique entries relevant to the category provided.",
    DEFAULT_SUGGEST_ITEM_PROMPT: "You are an expert creative assistant. Your task is to suggest 20 new, unique, and descriptive sub-category names for a parent category called '{parentPath}'.\n\n**RULES:**\n1. The names must be suitable for use as filenames. Use underscores_between_words.\n2. The names must be specific and creative.\n3. **CRITICAL:** Do NOT include the parent category name ('{parentPath}') in your suggestions.\n4. **CRITICAL:** Do NOT use generic placeholders like \"new_item\", \"category_name\", or similar variations.\n5. The output MUST be ONLY a valid JSON array of objects. Each object must have a \"name\" and an \"instruction\" key.\n\nFor context, you will be given the existing items that are siblings to the one you are suggesting for. Do not suggest items that already exist in the provided structure.",
    DEFAULT_TEMPLATE_PROMPT: "You are a Template Architect for AI image prompts.\n\nCreate prompt TEMPLATES using ~~CategoryName~~ syntax that reference the provided wildcard categories.\n\nYou will receive a list of AVAILABLE WILDCARD CATEGORIES wrapped in ~~tildes~~.\n\n**RULES:**\n1. Use ONLY the provided category names in ~~CategoryName~~ format\n2. Each template MUST have at least 2 different categories\n3. Use natural English connectors between categories (doing, at, in, with, near, etc.)\n4. Create varied, semantically coherent scene compositions\n5. Combine subjects, actions, and environments creatively\n\nReturn ONLY a valid JSON array of 20 template strings.",
    DEFAULT_DEDUPLICATE_PROMPT: "You are an expert at organizing data. For each duplicate wildcard, determine which category path is the BEST semantic fit based on the category names. Choose the category that most naturally represents the wildcard's meaning.\n\nReturn a JSON array with your decisions. For each item, include:\n- \"wildcard\": the normalized wildcard text\n- \"keep_path\": the full path to the category that should keep this wildcard"
};

export const Config = {};

export async function loadConfig() {
    try {
        // Use CONFIG_CONSTANTS as the single source of truth for defaults
        const defaultConfig = { ...CONFIG_CONSTANTS };

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
            MODEL_REASONING_MAX_TOKENS: 0, // 0 = disabled
            // Mindmap Configuration
            MINDMAP_FONT_SIZE_CATEGORY: 96, // Bold, Outlined
            MINDMAP_FONT_SIZE_LIST: 64,     // Filled background
            MINDMAP_FONT_SIZE_WILDCARD: 20, // Basic
            // Display & UI Settings
            DEFAULT_WILDCARDS_VISIBLE: true,
            ENABLE_ANIMATIONS: true,
            COMPACT_CARD_MODE: false,
            AUTO_SAVE_INTERVAL: 0, // 0 = disabled, ms between auto-saves
            // Storage Profile
            STORAGE_PROFILE: 'default',
            // Hybrid Template Engine
            USE_HYBRID_ENGINE: false,
            TEMPLATE_MODE: 'wildcard'  // 'wildcard' | 'strict' | 'hybrid'
        };

        Object.assign(Config, defaultConfig, userDefaults, savedConfig ? JSON.parse(savedConfig) : {});

        // Migration: Port old keys to new keys if they exist in Config (merged from saved) but new keys are default
        // Old: MINDMAP_CATEGORY_FONT_SIZE -> New: MINDMAP_FONT_SIZE_CATEGORY
        // Old: MINDMAP_NODE_FONT_SIZE     -> New: MINDMAP_FONT_SIZE_LIST
        // Note: Check Config directly as it contains the merged result
        if (Config.MINDMAP_CATEGORY_FONT_SIZE && !savedConfig?.includes('MINDMAP_FONT_SIZE_CATEGORY')) {
            Config.MINDMAP_FONT_SIZE_CATEGORY = Config.MINDMAP_CATEGORY_FONT_SIZE;
            delete Config.MINDMAP_CATEGORY_FONT_SIZE;
        }
        if (Config.MINDMAP_NODE_FONT_SIZE && !savedConfig?.includes('MINDMAP_FONT_SIZE_LIST')) {
            Config.MINDMAP_FONT_SIZE_LIST = Config.MINDMAP_NODE_FONT_SIZE;
            delete Config.MINDMAP_NODE_FONT_SIZE;
        }

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
        // Fallback to constants
        Object.assign(Config, CONFIG_CONSTANTS);
    }
}


let lastSaveToastTime = 0;

export async function saveConfig() {
    try {
        // Build complete defaults from CONFIG_CONSTANTS + user defaults
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
            MODEL_REASONING_MAX_TOKENS: 0,
            MINDMAP_FONT_SIZE_CATEGORY: 96,
            MINDMAP_FONT_SIZE_LIST: 64,
            MINDMAP_FONT_SIZE_WILDCARD: 20,
            DEFAULT_WILDCARDS_VISIBLE: true,
            ENABLE_ANIMATIONS: true,
            COMPACT_CARD_MODE: false,
            AUTO_SAVE_INTERVAL: 0,
            STORAGE_PROFILE: 'default',
            USE_HYBRID_ENGINE: false,
            TEMPLATE_MODE: 'wildcard'
        };
        const allDefaults = { ...CONFIG_CONSTANTS, ...userDefaults };

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
                    'MODEL_REASONING_EFFORT', 'MODEL_REASONING_MAX_TOKENS',
                    'MINDMAP_FONT_SIZE_CATEGORY', 'MINDMAP_FONT_SIZE_LIST', 'MINDMAP_FONT_SIZE_WILDCARD',
                    'DEFAULT_WILDCARDS_VISIBLE', 'ENABLE_ANIMATIONS', 'COMPACT_CARD_MODE', 'AUTO_SAVE_INTERVAL', 'STORAGE_PROFILE',
                    'USE_HYBRID_ENGINE', 'TEMPLATE_MODE'
                ].includes(key)) {
                    changedConfig[key] = Config[key];
                }
            }
        }

        localStorage.setItem(Config.CONFIG_STORAGE_KEY, JSON.stringify(changedConfig));

        if (UI && UI.showToast) {
            const now = Date.now();
            if (now - lastSaveToastTime > 1000) {
                UI.showToast('Configuration saved.', 'success');
                lastSaveToastTime = now;
            }
        }
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

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export async function saveApiKey(provider, key, persist) {
    // TODO: Add key format validation (e.g., OpenRouter keys start with 'sk-or-')
    const configKey = `API_KEY_${provider.toUpperCase()}`;
    Config[configKey] = key;

    const storageKey = `wildcards_api_key_${provider}`;
    if (persist) {
        const encryptedData = await encrypt(key);
        if (encryptedData) {
            // Store IV and encrypted data together
            const dataToStore = {
                iv: arrayBufferToBase64(encryptedData.iv),
                encrypted: arrayBufferToBase64(encryptedData.encrypted),
            };
            localStorage.setItem(storageKey, JSON.stringify(dataToStore));
        }
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
