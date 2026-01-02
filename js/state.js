import { Config } from './config.js';
import YAML from 'https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js';
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/build/index.js';
import { signal, batch } from 'https://cdn.jsdelivr.net/npm/@preact/signals-core@1.5.0/dist/signals-core.module.js';

// --- Signal Management ---
// We maintain a map of path strings to signals.
// When the proxy traps a change, it updates the corresponding signal.
const signalRegistry = new Map();

function getSignalForPath(path) {
    const pathStr = Array.isArray(path) ? path.join('/') : path;
    if (!signalRegistry.has(pathStr)) {
        // Initialize with current value if possible, or null
        // We rely on the State to populate it, but here we might need to look it up?
        // Ideally we only ask for signals that exist.
        // For now, start undefined, it will be updated by the proxy or initial load.
        signalRegistry.set(pathStr, signal(undefined));
    }
    return signalRegistry.get(pathStr);
}

function updateSignal(path, value) {
    const pathStr = Array.isArray(path) ? path.join('/') : path;
    // Update exact match
    if (signalRegistry.has(pathStr)) {
        signalRegistry.get(pathStr).value = value;
    }
    // Also update parent paths?
    // If 'a/b' changes, 'a' technically changed too (new reference).
    // Our Deep Proxy implementation might trigger updates for parents too?
    // Standard Deep Proxy usually only triggers for the property set.
    // But if we replace an object, parents should know?
    // In this implementation, we rely on the consumer (Component) to subscribe to the specific path it cares about.
    // If 'wildcards.Characters' changes, the Category Component for 'Characters' updates.
}


// --- IndexedDB ---
const DB_NAME = 'WildcardGeneratorDB';
const DB_VERSION = 1;
const STORE_NAME = 'state';

async function initDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
}

// --- Deep Proxy ---
function createDeepProxy(target, path = [], onChange) {
    if (typeof target !== 'object' || target === null) {
        return target;
    }

    const handler = {
        get(target, property, receiver) {
            // Special property to access raw target if needed
            if (property === '__raw__') return target;

            const value = Reflect.get(target, property, receiver);

            if (typeof value === 'object' && value !== null) {
                return createDeepProxy(value, [...path, property], onChange);
            }
            return value;
        },
        set(target, property, value, receiver) {
            const oldValue = target[property];
            const success = Reflect.set(target, property, value, receiver);

            if (success && oldValue !== value) {
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

// --- Patch / Transaction System ---
// Simple patch format: { op: 'set'|'delete', path: string[], value: any, oldValue: any }
// We store inverse patches for Undo.

const State = {
    _rawData: { wildcards: {}, systemPrompt: '', suggestItemPrompt: '', pinnedCategories: [], availableModels: [] },
    state: null, // The public reactive proxy

    events: new EventTarget(),

    // History
    historyStack: [], // Stack of inverse patches
    redoStack: [], // Stack of patches to re-apply
    isUndoing: false,

    async init() {
        await this.loadState();

        // Ensure defaults
        if (!this._rawData.wildcards) this._rawData.wildcards = {};
        if (!this._rawData.systemPrompt) this._rawData.systemPrompt = Config.DEFAULT_SYSTEM_PROMPT;
        if (!this._rawData.suggestItemPrompt) this._rawData.suggestItemPrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;

        const hasWildcards = Object.keys(this._rawData.wildcards).length > 0;
        if (!hasWildcards) {
            await this.resetState(false);
        }

        this._initProxy();

        // Initial signal population (recursive)
        this._populateSignals(this._rawData, []);

        this.events.dispatchEvent(new CustomEvent('state-reset'));
    },

    _populateSignals(obj, path) {
        // Set signal for current object
        updateSignal(path, obj);
        if (typeof obj === 'object' && obj !== null) {
            Object.keys(obj).forEach(key => {
                this._populateSignals(obj[key], [...path, key]);
            });
        }
    },

    _initProxy() {
        this.state = createDeepProxy(this._rawData, [], (path, value, target, type) => {
            // 0. Auto-sort if needed (wildcards arrays)
            if (Array.isArray(target) && path.length >= 2 && path[path.length - 2] === 'wildcards') {
                target.sort((a, b) => a.localeCompare(b));
            }

            // 1. Update Signals
            // We update the signal for this specific path
            updateSignal(path, value);

            // Also, because the parent object has changed (it now has a new property value),
            // we should ideally notify the parent signal too?
            // Actually, in JS object refs, 'target' is the parent object.
            // The 'target' (which is the parent) has been mutated.
            // So we should update the signal for the parent path.
            const parentPath = path.slice(0, -1);
            updateSignal(parentPath, target);


            // 2. Persist to IDB (Debounced handled by IDB usually fast enough, or we can debounce)
            if (!this.isUndoing) {
                this._saveToStorage();
                this.saveStateToHistory(); // Record snapshot for history
            }

            // 4. Dispatch Event (Legacy compatibility)
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

    async _saveToStorage() {
        try {
            const db = await initDB();
            await db.put(STORE_NAME, JSON.parse(JSON.stringify(this._rawData)), 'root');
        } catch (e) {
            console.error("Failed to save to IDB:", e);
        }
    },

    async loadState() {
        try {
            const db = await initDB();
            const data = await db.get(STORE_NAME, 'root');
            if (data) {
                this._rawData = data;
            } else {
                // Fallback to localStorage for migration
                const ls = localStorage.getItem(Config.STORAGE_KEY);
                if (ls) {
                    this._rawData = JSON.parse(ls);
                    // Migrate to IDB
                    await this._saveToStorage();
                }
            }
        } catch (e) {
            console.error("Failed to load state:", e);
        }
    },

    async resetState(notify = true) {
        try {
            const response = await fetch('/data/initial-data.yaml');
            if (response.ok) {
                const text = await response.text();
                const doc = YAML.parseDocument(text);
                const newData = this.processYamlNode(doc.contents);

                this._rawData.wildcards = newData || {};
                this._rawData.systemPrompt = Config.DEFAULT_SYSTEM_PROMPT;
                this._rawData.suggestItemPrompt = Config.DEFAULT_SUGGEST_ITEM_PROMPT;
                this._rawData.pinnedCategories = [];

                await this._saveToStorage();
                this._initProxy(); // Re-wrap
                this._populateSignals(this._rawData, []);

                this.events.dispatchEvent(new CustomEvent('state-reset'));
                if (notify) this.events.dispatchEvent(new CustomEvent('notification', { detail: 'State reset to defaults.' }));
            }
        } catch (e) {
            console.error("Reset failed", e);
        }
    },

    // Signal Accessor
    getSignal(path) {
        // path can be string 'wildcards/Characters' or array
        const p = Array.isArray(path) ? path.join('/') : path;
        return getSignalForPath(p);
    },

    // Legacy Helpers
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
                if (valueNode && (valueNode.commentBefore || valueNode.comment)) {
                    const raw = valueNode.commentBefore || valueNode.comment;
                    if (raw && raw.includes('instruction:')) instruction = raw.split('instruction:')[1].trim();
                }
                const processedValue = this.processYamlNode(valueNode);
                if (typeof processedValue === 'object' && processedValue !== null && !Array.isArray(processedValue)) {
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
            this._saveToStorage(); // Sync state to IDB
            this._initProxy(); // Re-bind proxy to new raw object
            this._populateSignals(this._rawData, []); // Re-populate signals
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
            this._saveToStorage();
            this._initProxy();
            this._populateSignals(this._rawData, []);
            this.events.dispatchEvent(new CustomEvent('state-reset'));
            return true;
        }
        return false;
    }
};

import { effect } from 'https://cdn.jsdelivr.net/npm/@preact/signals-core@1.5.0/dist/signals-core.module.js';
export { State, signal, batch, effect };
