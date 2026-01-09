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

/**
 * Calculate differences between two objects.
 * Returns an array of { path: string[], type: 'add'|'remove'|'modify', value: any }
 */
function deepDiff(oldObj, newObj, path = []) {
    const changes = [];

    // Handle primitives or null
    if (typeof oldObj !== 'object' || oldObj === null ||
        typeof newObj !== 'object' || newObj === null) {
        if (oldObj !== newObj) {
            changes.push({ path, type: 'modify', value: newObj, oldValue: oldObj });
        }
        return changes;
    }

    // Handle arrays
    if (Array.isArray(oldObj) && Array.isArray(newObj)) {
        // For simplicity, if arrays differ in length or content, treat as full replacement
        // This avoids complex array diffing for now
        const oldStr = JSON.stringify(oldObj);
        const newStr = JSON.stringify(newObj);
        if (oldStr !== newStr) {
            changes.push({ path, type: 'modify', value: newObj, oldValue: oldObj });
        }
        return changes;
    }

    // Handle objects
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
        const newPath = [...path, key];
        const oldVal = oldObj[key];
        const newVal = newObj[key];

        if (!(key in oldObj)) {
            // Key added
            changes.push({ path: newPath, type: 'add', value: newVal });
        } else if (!(key in newObj)) {
            // Key removed
            changes.push({ path: newPath, type: 'remove', oldValue: oldVal });
        } else if (typeof oldVal === 'object' && oldVal !== null &&
            typeof newVal === 'object' && newVal !== null &&
            !Array.isArray(oldVal) && !Array.isArray(newVal)) {
            // Both are objects, recurse
            changes.push(...deepDiff(oldVal, newVal, newPath));
        } else {
            // Primitive or array comparison
            const oldStr = JSON.stringify(oldVal);
            const newStr = JSON.stringify(newVal);
            if (oldStr !== newStr) {
                changes.push({ path: newPath, type: 'modify', value: newVal, oldValue: oldVal });
            }
        }
    }

    return changes;
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
                target.sort((a, b) => String(a || '').localeCompare(String(b || '')));
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
            const response = await fetch('data/initial-data.yaml');
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
        try {
            localStorage.setItem(Config.HISTORY_KEY, JSON.stringify(this.history));
        } catch (e) {
            // Handle QuotaExceededError - localStorage limit (~5-10MB depending on browser)
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn('LocalStorage quota exceeded, trimming history...');
                // Trim history to half its size
                const halfSize = Math.max(5, Math.floor(this.history.length / 2));
                this.history = this.history.slice(-halfSize);
                this.historyIndex = Math.min(this.historyIndex, this.history.length - 1);
                try {
                    localStorage.setItem(Config.HISTORY_KEY, JSON.stringify(this.history));
                } catch (e2) {
                    // Still over quota - clear history entirely
                    console.error('Still over quota after trim, clearing history');
                    this.clearHistory();
                }
            } else {
                console.error('Failed to save history:', e);
            }
        }
    },

    undo() {
        if (this.historyIndex > 0) {
            const oldData = this._rawData;
            this.historyIndex--;
            const newData = JSON.parse(this.history[this.historyIndex]);

            // Calculate diff for granular UI updates
            const changes = deepDiff(oldData, newData);

            this._rawData = newData;
            this._saveHistoryToStorage();
            this._saveToLocalStorage();
            this._initProxy();

            // Dispatch patch event if we have specific changes, otherwise fallback to reset
            if (changes.length > 0 && changes.length < 50) {
                this.events.dispatchEvent(new CustomEvent('state-patch', { detail: changes }));
            } else {
                // Too many changes or structural change - do full reset
                this.events.dispatchEvent(new CustomEvent('state-reset'));
            }
            return true;
        }
        return false;
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            const oldData = this._rawData;
            this.historyIndex++;
            const newData = JSON.parse(this.history[this.historyIndex]);

            // Calculate diff for granular UI updates
            const changes = deepDiff(oldData, newData);

            this._rawData = newData;
            this._saveHistoryToStorage();
            this._saveToLocalStorage();
            this._initProxy();

            // Dispatch patch event if we have specific changes, otherwise fallback to reset
            if (changes.length > 0 && changes.length < 50) {
                this.events.dispatchEvent(new CustomEvent('state-patch', { detail: changes }));
            } else {
                this.events.dispatchEvent(new CustomEvent('state-reset'));
            }
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

    /**
     * Find duplicate wildcards across the entire dataset.
     * @returns {{duplicates: Array, duplicateMap: Set}}
     */
    findDuplicates() {
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

        scanData(this.state.wildcards, '');

        const duplicates = [];
        const duplicateNormalized = new Set();

        wildcardMap.forEach((locations, normalized) => {
            if (locations.length > 1) {
                duplicates.push({ normalized, locations, count: locations.length });
                duplicateNormalized.add(normalized);
            }
        });

        // Sort by count descending
        duplicates.sort((a, b) => b.count - a.count);

        return { duplicates, duplicateMap: duplicateNormalized };
    },

    /**
     * Remove duplicates based on a strategy.
     * @param {Array} duplicates - The duplicates array from findDuplicates
     * @param {'shortest-path'|'longest-path'|'keep-first'|'keep-last'|'ai-smart'} strategy
     * @param {Map<string, string>} [aiDecisions] - For 'ai-smart' strategy: Map of normalized wildcard → path to keep
     * @returns {number} Number of removed duplicates
     */
    cleanDuplicates(duplicates, strategy, aiDecisions = null) {
        if (!duplicates || duplicates.length === 0) return 0;

        this.saveStateToHistory(); // Crucial: Undo point

        let removedCount = 0;
        let requiresUpdate = false;

        // Process each duplicate group
        duplicates.forEach(dupe => {
            let toKeep;
            let toRemove;

            if (strategy === 'ai-smart' && aiDecisions) {
                // AI has decided which path to keep
                const keepPath = aiDecisions.get(dupe.normalized);
                if (keepPath) {
                    toKeep = dupe.locations.find(loc => loc.path === keepPath);
                    toRemove = dupe.locations.filter(loc => loc.path !== keepPath);
                } else {
                    // Fallback to first if AI didn't decide
                    toKeep = dupe.locations[0];
                    toRemove = dupe.locations.slice(1);
                }
            } else if (strategy === 'keep-first') {
                // Keep the first occurrence in traversal order (lowest index overall)
                // Locations are already in traversal order from findDuplicates
                toKeep = dupe.locations[0];
                toRemove = dupe.locations.slice(1);
            } else if (strategy === 'keep-last') {
                // Keep the last occurrence in traversal order
                toKeep = dupe.locations[dupe.locations.length - 1];
                toRemove = dupe.locations.slice(0, -1);
            } else {
                // Sort locations based on path depth strategy
                const sortedLocs = [...dupe.locations].sort((a, b) => {
                    const lenA = a.path.split('/').length;
                    const lenB = b.path.split('/').length;

                    if (strategy === 'shortest-path') {
                        // We want shortest first (to keep)
                        if (lenA !== lenB) return lenA - lenB;
                        return a.path.localeCompare(b.path);
                    } else {
                        // longest-path: We want longest first (to keep)
                        if (lenA !== lenB) return lenB - lenA;
                        return a.path.localeCompare(b.path);
                    }
                });

                toKeep = sortedLocs[0];
                toRemove = sortedLocs.slice(1);
            }

            toRemove.forEach(loc => {
                // Operate on _rawData directly to avoid Proxy traps and side effects during bulk delete
                let parent = this._rawData.wildcards;
                const parts = loc.path.split('/');
                for (const part of parts) {
                    if (parent && parent[part] !== undefined) {
                        parent = parent[part];
                    } else {
                        parent = undefined;
                        break;
                    }
                }

                if (parent && parent.wildcards && Array.isArray(parent.wildcards)) {
                    // Find index by value
                    const idx = parent.wildcards.findIndex(w => w.toLowerCase().trim() === dupe.normalized);
                    if (idx !== -1) {
                        parent.wildcards.splice(idx, 1);
                        removedCount++;
                        requiresUpdate = true;
                    }
                }
            });
        });

        if (requiresUpdate) {
            this._saveToLocalStorage();
            // Dispatch reset to force full UI refresh since we bypassed proxy events
            this.events.dispatchEvent(new CustomEvent('state-reset'));
        }

        return removedCount;
    },

    /**
     * Check if a path is within the 0_TEMPLATES category
     * @param {string} path
     * @returns {boolean}
     */
    isTemplateCategory(path) {
        return path?.startsWith('0_TEMPLATES');
    },

    /**
     * Get all wildcard list paths (excluding 0_TEMPLATES itself)
     * @returns {Array<{path: string, name: string, topLevel: string}>}
     */
    getAllWildcardPaths() {
        const paths = [];
        const traverse = (obj, currentPath) => {
            for (const [key, value] of Object.entries(obj)) {
                if (key === 'instruction') continue;
                const path = currentPath ? `${currentPath}/${key}` : key;
                // Skip 0_TEMPLATES category itself
                if (path.startsWith('0_TEMPLATES')) continue;
                // Strict check: must have wildcards as array
                if (value && typeof value === 'object' && Array.isArray(value.wildcards)) {
                    paths.push({
                        path,
                        name: key.replace(/_/g, ' '),
                        topLevel: path.split('/')[0]
                    });
                } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                    traverse(value, path);
                }
            }
        };
        traverse(this.state.wildcards, '');
        return paths;
    },

    /**
     * Build a path map from selected paths for template generation.
     * Uses leaf category names as keys for better LLM semantic context.
     * @param {string[]} selectedPaths
     * @returns {Object<string, string>} Map of leaf names to full paths
     */
    buildPathMap(selectedPaths) {
        const map = {};
        const usedNames = new Set();

        selectedPaths.forEach(path => {
            let leafName = path.split('/').pop();

            // Handle duplicate leaf names by appending parent context
            if (usedNames.has(leafName)) {
                const parts = path.split('/');
                if (parts.length > 1) {
                    leafName = `${parts[parts.length - 2]}_${leafName}`;
                }
            }

            usedNames.add(leafName);
            map[leafName] = path;
        });
        return map;
    }
};

export { State };
