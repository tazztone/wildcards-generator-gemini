import { Config, saveConfig } from './config.js';
import YAML from 'https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js'; // Keep import consistent

// Helper to create a deep proxy that knows its path
function createDeepProxy(target, path = [], onChange) {
    if (typeof target !== 'object' || target === null) {
        return target;
    }

    // If it's already a proxy, return it (to avoid double wrapping if logic allows)
    // But standard Proxy doesn't expose this, so we rely on structure.

    const handler = {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);

            // Only proxy objects and arrays
            if (typeof value === 'object' && value !== null) {
                // We need to return a proxy for this nested object too
                // The path for this nested object is [...path, property]
                return createDeepProxy(value, [...path, property], onChange);
            }
            return value;
        },
        set(target, property, value, receiver) {
            const oldValue = target[property];
            const success = Reflect.set(target, property, value, receiver);

            if (success && oldValue !== value) {
                // Notify change with full path
                onChange([...path, property], value, target);
            }
            return success;
        },
        deleteProperty(target, property) {
            const success = Reflect.deleteProperty(target, property);
            if (success) {
                onChange([...path, property], undefined, target, 'delete');
            }
            return success;
        }
    };
    return new Proxy(target, handler);
}

const State = {
    _rawData: { wildcards: {}, systemPrompt: '', suggestItemPrompt: '', pinnedCategories: [], availableModels: [] }, // internal raw storage
    state: null, // The public reactive proxy

    history: [],
    historyIndex: -1,

    // Event Target for dispatching custom events
    events: new EventTarget(),

    async init() {
        this.loadState();

        // Check if we actually have wildcards data, not just an empty state from a failed load
        const hasData = localStorage.getItem(Config.STORAGE_KEY);
        const hasWildcards = hasData && this._rawData.wildcards && Object.keys(this._rawData.wildcards).length > 0;

        if (!hasWildcards) {
            await this.resetState(false);
        }

        this.loadHistory();

        // Initialize the proxy
        this._initProxy();

        // Always dispatch state-reset for initial render
        this.events.dispatchEvent(new CustomEvent('state-reset'));
    },

    _initProxy() {
        this.state = createDeepProxy(this._rawData, [], (path, value, target, type) => {
            // 0. Auto-sort wildcard arrays (if enabled/applicable)
            // If the target is an array and it belongs to a 'wildcards' list, sort it.
            // Check if path ends with 'wildcards' -> index (so path to array ends in 'wildcards')
            if (Array.isArray(target) && path.length >= 2 && path[path.length - 2] === 'wildcards') {
                target.sort((a, b) => a.localeCompare(b));
            }

            // 1. Save to LocalStorage (debouncing could be added here if needed, but synchronous is safer for now)
            this._saveToLocalStorage();

            // 2. Dispatch Custom Event
            // Path is array e.g. ['wildcards', 'Characters', 'wildcards', '0']
            const event = new CustomEvent('state-updated', {
                detail: {
                    path: path,
                    pathString: path.join('.'),
                    value: value,
                    type: type || 'set'
                }
            });
            this.events.dispatchEvent(event);
        });
    },

    _saveToLocalStorage() {
        try {
            localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(this._rawData));
        } catch (e) {
            console.error("Failed to save state:", e);
        }
    },

    loadState() {
        try {
            const savedState = localStorage.getItem(Config.STORAGE_KEY);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                if (parsed.wildcards) {
                    this._rawData = parsed;
                    // Ensure defaults
                    this._rawData.systemPrompt = this._rawData.systemPrompt || Config.DEFAULT_SYSTEM_PROMPT;
                    this._rawData.suggestItemPrompt = this._rawData.suggestItemPrompt || Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                    return;
                }
            }
        } catch (error) { console.error("Failed to load state", error); }
    },

    async resetState(notify = true) {
        // Implementation of logic to load initial data
        try {
            const response = await fetch('/data/initial-data.yaml');
            if (response.ok) {
                const text = await response.text();
                const doc = YAML.parseDocument(text);
                if (doc.errors && doc.errors.length > 0) {
                    console.error("YAML Parse Errors:", doc.errors);
                    throw new Error("YAML Parsing failed");
                }
                const newData = this.processYamlNode(doc.contents);

                // Update raw data
                this._rawData.wildcards = newData || {}; // Ensure object
                this._rawData.systemPrompt = Config.DEFAULT_SYSTEM_PROMPT;
                this._rawData.suggestItemPrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                this._rawData.pinnedCategories = [];

                this._saveToLocalStorage();
                this.clearHistory();
                this.saveStateToHistory();

                this._initProxy();

                this.events.dispatchEvent(new CustomEvent('state-reset'));
                if (notify) this.events.dispatchEvent(new CustomEvent('notification', { detail: 'State reset to defaults.' }));

            } else {
                console.error(`Fetch failed: ${response.status} ${response.statusText}`);
                throw new Error(`Could not load initial-data.yaml: ${response.status}`);
            }
        } catch (e) {
            console.error("Reset failed", e);
            // Fallback empty
            this._rawData.wildcards = {};
            this._rawData.systemPrompt = "";
            this._saveToLocalStorage();
            this._initProxy();
            this.events.dispatchEvent(new CustomEvent('state-reset'));
        }
    },

    // History Management
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
        localStorage.removeItem(Config.HISTORY_KEY);
    },

    saveStateToHistory() {
        // Deep clone current state string
        const stateStr = JSON.stringify(this._rawData);

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(stateStr);
        if (this.history.length > Config.HISTORY_LIMIT) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
        this._saveHistoryToStorage();
    },

    loadHistory() {
        try {
            const h = localStorage.getItem(Config.HISTORY_KEY);
            if (h) {
                this.history = JSON.parse(h);
                this.historyIndex = this.history.length - 1;
            } else {
                this.history = [JSON.stringify(this._rawData)];
                this.historyIndex = 0;
            }
        } catch (e) { console.error(e); this.history = []; }
    },

    _saveHistoryToStorage() {
        localStorage.setItem(Config.HISTORY_KEY, JSON.stringify(this.history));
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this._rawData = JSON.parse(this.history[this.historyIndex]);
            this._saveHistoryToStorage();
            this._saveToLocalStorage(); // Sync state
            this._initProxy(); // Re-bind proxy to new raw object
            this.events.dispatchEvent(new CustomEvent('state-reset')); // Treat as full reset for UI to re-render all
            return true;
        }
        return false;
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this._rawData = JSON.parse(this.history[this.historyIndex]);
            this._saveHistoryToStorage();
            this._saveToLocalStorage();
            this._initProxy();
            this.events.dispatchEvent(new CustomEvent('state-reset'));
            return true;
        }
        return false;
    },

    // Helpers
    getObjectByPath(path) {
        if (!path) return this.state.wildcards;
        return path.split('/').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, this.state.wildcards);
    },

    getParentObjectByPath(path) {
        if (!path || !path.includes('/')) return this.state.wildcards;
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        return this.getObjectByPath(parentPath);
    },

    processYamlNode(node) {
        if (YAML.isMap(node)) {
            const result = {};
            node.items.forEach(pair => {
                const key = pair.key.value;
                const valueNode = pair.value;
                let instruction = "";
                // Attempt to extract instruction from comments
                if (valueNode && (valueNode.commentBefore || valueNode.comment)) {
                    const raw = valueNode.commentBefore || valueNode.comment; // Simplified
                    if (raw && raw.includes('instruction:')) instruction = raw.split('instruction:')[1].trim();
                }

                const processedValue = this.processYamlNode(valueNode);
                if (typeof processedValue === 'object' && !Array.isArray(processedValue)) {
                    processedValue.instruction = instruction;
                    result[key] = processedValue;
                } else if (Array.isArray(processedValue)) {
                    result[key] = { instruction, wildcards: processedValue };
                } else {
                    result[key] = { instruction, wildcards: [String(processedValue)] };
                }
            });
            return result;
        } else if (YAML.isSeq(node)) {
            return node.items.map(item => (item && item.value !== undefined) ? item.value : item);
        } else if (YAML.isScalar(node)) {
            return node.value;
        }
        return {};
    }
};

export { State };
