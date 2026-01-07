/**
 * Mind Elixir Mindmap View Module
 * Provides an alternative visualization for the wildcards hierarchy as an interactive mindmap.
 */
import { State } from '../state.js';
import { Config, saveConfig } from '../config.js';
import { UI } from '../ui.js';

// View mode constants
const VIEW_MODES = {
    LIST: 'list',
    MINDMAP: 'mindmap',
    DUAL: 'dual'
};

/**
 * @typedef {Object} MindElixirInstance
 * @property {Function} changeTheme
 * @property {Function} refresh
 * @property {Function} getData
 * @property {Function} toCenter
 * @property {Function} scale
 * @property {Function} destroy
 * @property {Function} init
 * @property {Object} bus
 * @property {Object} currentNode
 */

const Mindmap = {
    /** @type {MindElixirInstance|null} */
    instance: null,
    dualInstance: null,
    currentView: VIEW_MODES.LIST,
    isInitialized: false,
    _syncLock: false, // Prevent infinite sync loops
    _MindElixir: null, // Cached MindElixir module reference
    showWildcards: false, // Start collapsed for better overview

    /**
     * Load Mind Elixir library dynamically
     * @returns {Promise<any>}
     */
    async loadMindElixir() {
        if (this._MindElixir) {
            return this._MindElixir;
        }

        try {
            // @ts-ignore - Dynamic import from CDN
            const module = await import('https://cdn.jsdelivr.net/npm/mind-elixir/dist/MindElixir.js');
            this._MindElixir = module.default || module;
            console.log('Mind Elixir loaded successfully');
            return this._MindElixir;
        } catch (error) {
            console.error('Failed to load Mind Elixir:', error);
            UI.showToast('Failed to load mindmap library', 'error');
            return null;
        }
    },

    /**
     * Transform State.wildcards → Mind Elixir format
     * @param {Object} wildcards - The wildcards object from State
     * @returns {Object} Mind Elixir compatible data structure
     */
    transformToMindElixir(wildcards) {
        let nodeId = 0;
        const generateId = (prefix) => `${prefix}-${++nodeId}`;
        const showWildcards = this.showWildcards;

        /**
         * Recursively build Mind Elixir node from wildcards data
         * @param {string} name - Node name
         * @param {Object} data - Node data (can have instruction, wildcards array, or subcategories)
         * @param {string} parentPath - Path string for ID generation
         * @returns {Object} Mind Elixir node
         */
        const buildNode = (name, data, parentPath = '') => {
            const path = parentPath ? `${parentPath}/${name}` : name;
            const wildcardCount = data.wildcards?.length || 0;

            // Build display name with count indicator when wildcards are hidden
            const displayName = (!showWildcards && wildcardCount > 0)
                ? `${name} (${wildcardCount})`
                : name;

            const node = {
                id: generateId(path),
                topic: displayName,
                tags: [],
                children: [],
                // Store original path for sync back
                data: {
                    path: path.split('/'),
                    originalName: name,
                    wildcardCount: wildcardCount
                }
            };

            // Add instruction as a tag if present
            if (data.instruction && typeof data.instruction === 'string') {
                node.tags.push(data.instruction.substring(0, 50) + (data.instruction.length > 50 ? '...' : ''));
            }

            // Process wildcards array (leaf items) - only if showWildcards is true
            if (showWildcards && data.wildcards && Array.isArray(data.wildcards)) {
                data.wildcards.forEach((wildcard, index) => {
                    const wildcardText = typeof wildcard === 'string' ? wildcard : wildcard.name || String(wildcard);
                    node.children.push({
                        id: generateId(`${path}/w${index}`),
                        topic: wildcardText,
                        data: {
                            path: [...path.split('/'), 'wildcards', index],
                            isWildcard: true
                        },
                        style: {
                            background: 'var(--chip-bg, #374151)',
                            color: 'var(--chip-text, #e5e7eb)',
                            fontSize: '12'
                        }
                    });
                });
            }

            // Recursively process subcategories
            Object.entries(data).forEach(([key, value]) => {
                if (key !== 'instruction' && key !== 'wildcards' && typeof value === 'object' && value !== null) {
                    node.children.push(buildNode(key, value, path));
                }
            });

            return node;
        };

        // Build root node with all top-level categories
        const rootNode = {
            id: 'root',
            topic: '🎯 Wildcards',
            root: true,
            children: Object.entries(wildcards).map(([name, data]) => buildNode(name, data))
        };

        return {
            nodeData: rootNode
        };
    },

    /**
     * Transform Mind Elixir data back to State.wildcards format
     * @param {Object} mindData - Mind Elixir export data
     * @returns {Object} State.wildcards compatible structure
     */
    transformFromMindElixir(mindData) {
        const buildWildcards = (node) => {
            const result = {};

            if (!node.children || node.children.length === 0) {
                return result;
            }

            // Separate wildcard items from subcategories
            const wildcardItems = [];
            const subcategories = {};

            node.children.forEach(child => {
                if (child.data?.isWildcard) {
                    wildcardItems.push(child.topic);
                } else {
                    // It's a subcategory
                    const childResult = buildWildcards(child);
                    if (Object.keys(childResult).length > 0 || child.children?.length > 0) {
                        subcategories[child.topic] = childResult;
                    } else {
                        // Empty category
                        subcategories[child.topic] = {};
                    }
                    // Check for instruction in tags
                    if (child.tags && child.tags.length > 0) {
                        subcategories[child.topic].instruction = child.tags[0];
                    }
                }
            });

            // Add wildcards if any
            if (wildcardItems.length > 0) {
                result.wildcards = wildcardItems;
            }

            // Merge subcategories
            Object.assign(result, subcategories);

            return result;
        };

        // Start from root's children (top-level categories)
        const wildcards = {};
        if (mindData.nodeData && mindData.nodeData.children) {
            mindData.nodeData.children.forEach(categoryNode => {
                wildcards[categoryNode.topic] = buildWildcards(categoryNode);
                // Add instruction if present
                if (categoryNode.tags && categoryNode.tags.length > 0) {
                    wildcards[categoryNode.topic].instruction = categoryNode.tags[0];
                }
            });
        }

        return wildcards;
    },

    /**
     * Initialize Mind Elixir instance
     * @param {string} containerSelector - CSS selector for container element
     */
    async init(containerSelector = '#mindmap-container') {
        // Load MindElixir dynamically
        const MindElixir = await this.loadMindElixir();
        if (!MindElixir) {
            return;
        }

        const container = /** @type {HTMLElement} */ (document.querySelector(containerSelector));
        if (!container) {
            console.warn(`Mindmap container not found: ${containerSelector}`);
            return;
        }

        // Clear any existing instance
        if (containerSelector === '#mindmap-container' && this.instance) {
            this.instance.destroy?.();
            this.instance = null;
        }

        // Smart context menu configuration
        const contextMenuExtend = [];

        // Generate action - only for categories with wildcards (not root, not wildcards themselves)
        contextMenuExtend.push({
            name: '✨ Generate Wildcards',
            onclick: (data) => {
                // Validate: skip for root node or wildcard items
                if (data.root || data.data?.isWildcard) {
                    UI.showToast('Select a category to use this action', 'warning');
                    return;
                }
                this.handleGenerateAction(data);
            }
        });

        // Suggest action - only for categories (not root, not wildcards)
        contextMenuExtend.push({
            name: '💡 Suggest Subcategories',
            onclick: (data) => {
                // Validate: skip for root node or wildcard items
                if (data.root || data.data?.isWildcard) {
                    UI.showToast('Select a category to use this action', 'warning');
                    return;
                }
                this.handleSuggestAction(data);
            }
        });

        const options = {
            el: container,
            direction: MindElixir.SIDE,
            draggable: true,
            toolBar: true,
            nodeMenu: true,
            keypress: true,
            locale: 'en',
            allowUndo: true,
            overflowHidden: false,
            mainLinkStyle: 2,
            contextMenu: {
                focus: true,
                link: false,
                extend: contextMenuExtend
            },
            before: {
                removeNode: async (el, obj) => {
                    // Confirm deletion for categories (not wildcards)
                    if (!obj.data?.isWildcard) {
                        return confirm(`Delete "${obj.topic}" and all its contents?`);
                    }
                    return true;
                }
            }
        };

        const instance = new MindElixir(options);
        const data = this.transformToMindElixir(State._rawData.wildcards || {});
        instance.init(data);

        // Store instance
        if (containerSelector === '#mindmap-container') {
            this.instance = instance;
        } else if (containerSelector === '#dual-mindmap') {
            this.dualInstance = instance;
        }

        // Setup event listeners for this instance
        this.setupEventListeners(instance, containerSelector);

        // Apply initial theme
        this.syncTheme(instance);

        // Add tooltips to toolbar icons
        this.addToolbarTooltips(container);

        // Auto-center and zoom to fit (start slightly zoomed out for better overview)
        setTimeout(() => {
            instance.toCenter();
            instance.scale(0.4); // Zoom out more for better overview
        }, 300);

        // Smart Context Menu Observer
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement && node.tagName === 'UL' && (node.className.includes('mind-elixir-menu') || node.className.includes('menu-list'))) {
                        requestAnimationFrame(() => this.optimizeContextMenu(/** @type {HTMLElement} */(node)));
                    }
                });
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = /** @type {HTMLElement} */ (mutation.target);
                    if (target instanceof HTMLElement && (target.className.includes('mind-elixir-menu') || target.className.includes('menu-list')) && target.style.display !== 'none') {
                        requestAnimationFrame(() => this.optimizeContextMenu(target));
                    }
                }
            });
        });
        this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

        this.isInitialized = true;
        console.log('Mind Elixir initialized:', containerSelector);
    },

    /**
     * Setup bidirectional event listeners
     * @param {MindElixirInstance} instance - Mind Elixir instance
     * @param {string} containerSelector - Container selector for context
     */
    setupEventListeners(instance, containerSelector) {
        // Mind Elixir → State sync
        instance.bus.addListener('operation', (operation) => {
            if (this._syncLock) return;
            this.handleMindmapOperation(operation, instance);
        });

        // Selection sync for dual pane mode
        instance.bus.addListener('selectNodes', (nodes) => {
            if (this.currentView === VIEW_MODES.DUAL && nodes.length > 0) {
                this.syncSelectionToList(nodes[0]);
            }
        });

        // State → Mind Elixir sync (listen once per module, not per instance)
        if (!this._stateListenersSetup) {
            State.events.addEventListener('state-updated', () => {
                this.refresh();
            });
            State.events.addEventListener('state-reset', () => {
                this.refresh();
            });
            this._stateListenersSetup = true;
        }
    },

    /**
     * Handle Mind Elixir operations and sync to State
     * @param {Object} operation - Operation object from Mind Elixir
     * @param {MindElixirInstance} instance - The Mind Elixir instance
     */
    handleMindmapOperation(operation, instance) {
        console.log('Mindmap operation:', operation.name, operation.obj);

        this._syncLock = true;

        try {
            // For now, just do a full sync after any operation
            // More granular syncing can be implemented later for better performance
            const data = instance.getData();
            const newWildcards = this.transformFromMindElixir(data);

            // Update State with new wildcards structure
            Object.keys(State._rawData.wildcards).forEach(key => {
                delete State._rawData.wildcards[key];
            });
            Object.assign(State._rawData.wildcards, newWildcards);

            State.saveStateToHistory();
            State._saveToLocalStorage();

            // Refresh UI if in dual mode
            if (this.currentView === VIEW_MODES.DUAL) {
                UI.renderCategories(State._rawData.wildcards);
            }
        } catch (error) {
            console.error('Error syncing mindmap to state:', error);
            UI.showToast('Failed to sync changes', 'error');
        } finally {
            this._syncLock = false;
        }
    },

    /**
     * Refresh mindmap from current State
     */
    refresh() {
        if (this._syncLock) return;

        if (this.instance && (this.currentView === VIEW_MODES.MINDMAP || this.currentView === VIEW_MODES.DUAL)) {
            try {
                const data = this.transformToMindElixir(State._rawData.wildcards || {});
                this.instance.refresh(data);
            } catch (error) {
                console.error('Error refreshing mindmap:', error);
            }
        }

        if (this.dualInstance && this.currentView === VIEW_MODES.DUAL) {
            try {
                const data = this.transformToMindElixir(State._rawData.wildcards || {});
                this.dualInstance.refresh(data);
            } catch (error) {
                console.error('Error refreshing dual mindmap:', error);
            }
        }
    },

    /**
     * Change view mode
     * @param {string} mode - 'list', 'mindmap', or 'dual'
     */
    async setView(mode) {
        if (!Object.values(VIEW_MODES).includes(mode)) {
            console.warn('Invalid view mode:', mode);
            return;
        }

        this.currentView = mode;

        // Save preference
        Config.PREFERRED_VIEW = mode;
        saveConfig();

        const listContainer = document.getElementById('wildcard-container');
        const mindmapContainer = document.getElementById('mindmap-container');
        const dualContainer = document.getElementById('dual-container');
        const searchSection = document.querySelector('.mt-6.text-left.max-w-4xl');
        const statsBar = document.getElementById('stats-bar');

        // Hide all containers first
        listContainer?.classList.add('hidden');
        mindmapContainer?.classList.add('hidden');
        dualContainer?.classList.add('hidden');

        // Update body class for CSS-based control visibility
        document.body.classList.remove('view-list', 'view-mindmap', 'view-dual');
        document.body.classList.add(`view-${mode}`);

        // Show appropriate container(s)
        switch (mode) {
            case VIEW_MODES.LIST:
                listContainer?.classList.remove('hidden');
                searchSection?.classList.remove('hidden');
                statsBar?.classList.remove('hidden');
                break;

            case VIEW_MODES.MINDMAP:
                mindmapContainer?.classList.remove('hidden');
                // Keep search section visible in Mindmap view per user request
                searchSection?.classList.remove('hidden');
                // Keep stats bar visible in all modes
                statsBar?.classList.remove('hidden');

                // Initialize if not already done
                if (!this.instance) {
                    await this.init('#mindmap-container');
                } else {
                    this.refresh();
                    this.instance.toCenter();
                }
                break;

            case VIEW_MODES.DUAL:
                dualContainer?.classList.remove('hidden');
                searchSection?.classList.remove('hidden');
                statsBar?.classList.remove('hidden');

                // Clone list into dual-list
                await this.initDualPane();
                break;
        }

        // Update view mode button states
        document.querySelectorAll('.view-mode-selector button').forEach(btn => {
            // Only toggle active for view buttons, not the toggle button
            if (btn.id.startsWith('view-')) {
                btn.classList.toggle('active', btn.id === `view-${mode}`);
            }
        });

        // Update collapse button state when switching views
        const toggleBtn = document.getElementById('mindmap-toggle-wildcards');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', !this.showWildcards);
            toggleBtn.innerHTML = this.showWildcards ?
                '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> Hide Wildcards' :
                '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 5.943 7.523 2 12 2c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S3.732 13.057 2.458 9c1.274-4.057 5.065-7 9.542-7z" /></svg> Show Wildcards';
            toggleBtn.title = this.showWildcards ? 'Hide wildcards (show categories only)' : 'Show wildcards';
        }

        UI.showToast(`Switched to ${mode} view`, 'success');
    },

    /**
     * Initialize dual pane mode
     */
    async initDualPane() {
        const dualList = document.getElementById('dual-list');
        const listContainer = document.getElementById('wildcard-container');

        if (dualList && listContainer) {
            // Clone the list content
            dualList.innerHTML = listContainer.innerHTML;
        }

        // Initialize mindmap in dual container
        if (!this.dualInstance) {
            const dualMindmap = document.getElementById('dual-mindmap');
            if (dualMindmap) {
                await this.init('#dual-mindmap');
            }
        } else {
            this.refresh();
        }
    },

    /**
     * Sync selection from mindmap to list view (for dual pane)
     * @param {Object} node - Selected Mind Elixir node
     */
    syncSelectionToList(node) {
        const dualList = document.getElementById('dual-list');
        if (!dualList) return;

        // Remove previous highlights
        dualList.querySelectorAll('.dual-highlight').forEach(el => {
            el.classList.remove('dual-highlight');
        });

        if (!node) return;

        // Strategy: Use robust path matching if available (added during transform)
        // Fallback to topic match if path is missing
        let targetPath = null;

        // Check for path in node data
        const nodePathData = node.data?.path || node.nodeObj?.data?.path;

        if (nodePathData && Array.isArray(nodePathData)) {
            const isWildcard = node.data?.isWildcard || node.nodeObj?.data?.isWildcard;
            if (isWildcard) {
                // Wildcard items are inside a Card (Category). Path is [...catPath, 'wildcards', index]
                // We want to highlight the Card container.
                const catPath = nodePathData.slice(0, -2); // Remove 'wildcards' and index
                targetPath = catPath.join('/');
            } else {
                // Category path
                targetPath = nodePathData.join('/');
            }
        }

        let target = null;
        if (targetPath) {
            // Find by data-path attribute (100% reliable)
            target = dualList.querySelector(`[data-path="${targetPath}"]`);

            // If we found a details element (category), the highlight target should be its summary?
            // Or we highlight the summary inside it.
            // If we found a div (card), highlight the div.
        } else {
            // Fallback to name matching (legacy)
            const topic = node.topic || node.text || node.nodeObj?.topic;
            if (topic) {
                const candidates = Array.from(dualList.querySelectorAll('.category-name, .wildcard-name'));
                const matchSpan = (span) => span.textContent.trim().toLowerCase() === topic.trim().toLowerCase();
                const span = candidates.find(matchSpan);
                if (span) target = span.closest('details, .wildcard-card');
            }
        }

        if (target) {
            // Determine highlight visual target
            let highlightTarget = target;
            if (target.tagName === 'DETAILS') {
                highlightTarget = target.querySelector('summary');
            }

            if (highlightTarget) {
                highlightTarget.classList.add('dual-highlight');

                // Expand all parent details
                let parent = target.parentElement;
                while (parent && parent !== dualList) {
                    if (parent.tagName === 'DETAILS') {
                        /** @type {HTMLDetailsElement} */ (parent).open = true;
                    }
                    parent = parent.parentElement;
                }

                // Scroll into view
                setTimeout(() => {
                    highlightTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    },

    /**
     * Sync theme between app and Mind Elixir
     * @param {MindElixirInstance} instance - Optional specific instance else uses this.instance
     */
    syncTheme(instance = null) {
        const targetInstance = instance || this.instance;
        if (!targetInstance) return;

        const isDark = document.documentElement.classList.contains('dark');

        const theme = isDark ? {
            name: 'Dark',
            palette: ['#848FA0', '#748BE9', '#D2F9FE', '#4145A5', '#789AFA', '#706CF4', '#EF987F', '#775DD5', '#FCEECF', '#DA7FBC'],
            cssVar: {
                '--main-color': '#e5e7eb',
                '--main-bgcolor': '#1f2937',
                '--color': '#d1d5db',
                '--bgcolor': '#111827',
                '--panel-color': '229, 231, 235',
                '--panel-bgcolor': '31, 41, 55',
            }
        } : {
            name: 'Light',
            palette: ['#848FA0', '#748BE9', '#A8E6CF', '#4145A5', '#789AFA', '#706CF4', '#EF987F', '#775DD5', '#FCEECF', '#DA7FBC'],
            cssVar: {
                '--main-color': '#1f2937',
                '--main-bgcolor': '#ffffff',
                '--color': '#374151',
                '--bgcolor': '#f3f4f6',
                '--panel-color': '31, 41, 55',
                '--panel-bgcolor': '255, 255, 255',
            }
        };

        try {
            targetInstance.changeTheme(theme);
        } catch (error) {
            console.warn('Could not apply theme to Mind Elixir:', error);
        }
    },

    /**
     * Handle AI Generate action from context menu
     * @param {Object} dataIgnored - Ignored, using instance.currentNode
     */
    handleGenerateAction(dataIgnored) {
        // Retrieve reliable node from captured state (fallback to current)
        const node = this.lastContextNode || this.instance?.currentNode;


        const topic = node?.topic || node?.nodeObj?.topic;
        const data = node?.data || node?.nodeObj?.data || {};

        if (!node || (!data.path && !topic)) {
            console.error('Mindmap: Cannot Resolve Node for Generate', node);
            UI.showToast('Cannot generate: Missing topic data', 'error');
            return;
        }

        // Reconstruct path if array
        let path = data.path;
        if (Array.isArray(path)) path = path;
        if (!path) path = [topic];

        // Dispatch event for App to handle
        const event = new CustomEvent('mindmap-generate', {
            detail: { path, nodeTopic: topic }
        });
        document.dispatchEvent(event);

        UI.showToast(`Generating wildcards for "${topic}"...`, 'info');
    },

    /**
     * Handle AI Suggest action from context menu
     * @param {Object} dataIgnored - Ignored, using captured state
     */
    handleSuggestAction(dataIgnored) {
        // Retrieve reliable node from captured state (fallback to current)
        const node = this.lastContextNode || this.instance?.currentNode;


        const topic = node?.topic || node?.nodeObj?.topic;
        const data = node?.data || node?.nodeObj?.data || {};

        // Validation: Must have a topic
        if (!node || !topic) {
            console.error('Mindmap: Cannot Resolve Node for Suggest', node);
            UI.showToast('Cannot suggest: Missing topic data', 'error');
            return;
        }

        const path = data.path || [topic];

        // Dispatch event for App to handle
        const event = new CustomEvent('mindmap-suggest', {
            detail: { path, nodeTopic: topic }
        });
        document.dispatchEvent(event);

        UI.showToast(`Getting suggestions for "${topic}"...`, 'info');
    },

    /**
     * Toggle wildcard visibility in both list and mindmap views
     */
    toggleWildcards() {
        const previousState = this.showWildcards;

        try {
            this.showWildcards = !this.showWildcards;

            // Toggle in List View (safe operation)
            const details = document.querySelectorAll('#wildcard-container details');
            details.forEach(detail => {
                /** @type {HTMLDetailsElement} */ (detail).open = this.showWildcards;
            });

            // Toggle in Mindmap View(s) - wrap in separate try block
            try {
                if (this.instance) {
                    this.refresh();
                }
                if (this.dualInstance) {
                    const data = this.transformToMindElixir(State._rawData.wildcards || {});
                    this.dualInstance.refresh(data);
                }
            } catch (mindmapError) {
                console.warn('Mindmap refresh failed during toggle:', mindmapError);
                // Continue - list toggle still succeeded
            }

            // Re-center after refresh (Mind Elixir's refresh moves the view origin)
            if (this.instance) setTimeout(() => this.instance.toCenter(), 100);
            if (this.dualInstance) setTimeout(() => this.dualInstance.toCenter(), 100);

            // Always update button state
            this.updateToggleButtonState();

            UI.showToast(this.showWildcards ? 'Showing wildcards' : 'Hiding wildcards', 'info');
        } catch (error) {
            console.error('Toggle wildcards error:', error);
            // Revert state on critical error
            this.showWildcards = previousState;
            this.updateToggleButtonState();
            UI.showToast('Failed to toggle wildcards', 'error');
        }
    },

    /**
     * Update the toggle button visual state to match internal state
     */
    updateToggleButtonState() {
        const toggleBtn = document.getElementById('mindmap-toggle-wildcards');
        if (!toggleBtn) return;

        toggleBtn.classList.toggle('active', !this.showWildcards);
        toggleBtn.innerHTML = this.showWildcards ?
            '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> Hide Wildcards' :
            '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Show Wildcards';
        toggleBtn.title = this.showWildcards ? 'Hide wildcards (show categories only)' : 'Show wildcards';
    },

    /**
     * Add tooltips to Mind Elixir toolbar icons
     * @param {HTMLElement} container - The mindmap container element
     */
    addToolbarTooltips(container) {
        if (!container) return;

        // Wait for Mind Elixir to render toolbar
        setTimeout(() => {
            // Find the toolbar and sidebar within the container
            const toolbar = container.querySelector('.mind-elixir-toolbar');
            const sidebar = container.querySelector('.mind-elixir-sidebar');

            // Toolbar spans (zoom controls, etc.)
            if (toolbar) {
                const spans = toolbar.querySelectorAll('span');
                const tooltipLabels = ['Fullscreen', 'Center view', 'Zoom out', 'Zoom in'];
                spans.forEach((span, i) => {
                    if (tooltipLabels[i]) {
                        /** @type {HTMLElement} */ (span).title = tooltipLabels[i];
                        span.setAttribute('aria-label', tooltipLabels[i]);
                    }
                });
            }

            // Sidebar layout buttons
            if (sidebar) {
                const layoutBtns = sidebar.querySelectorAll('span');
                const layoutLabels = ['Left layout', 'Right layout', 'Radial layout'];
                layoutBtns.forEach((btn, i) => {
                    if (layoutLabels[i]) {
                        /** @type {HTMLElement} */ (btn).title = layoutLabels[i];
                        btn.setAttribute('aria-label', layoutLabels[i]);
                    }
                });
            }
        }, 500);
    },

    /**
     * optimize Context Menu options based on selection
     * @param {HTMLElement} menuEl - The context menu element
     */
    optimizeContextMenu(menuEl) {
        // Capture the current node immediately when menu opens
        this.lastContextNode = this.instance?.currentNode;

        console.log('[SmartMenu] Optimization triggered. Current Node:', this.lastContextNode);

        if (!this.instance || !this.instance.currentNode) {
            console.warn('[SmartMenu] Node undefined, aborting.');
            return;
        }

        const node = this.instance.currentNode;
        // Robust check for Wildcard type (leaf item)
        const isWildcard = node.data?.isWildcard || node.nodeObj?.data?.isWildcard || (node.nodeObj && !node.nodeObj.children && !node.root);
        // Robust check for Root
        const isRoot = node.root || node.nodeObj?.root;
        // Check if category has wildcards (wildcard list - should not suggest subcategories)
        const wildcardCount = node.data?.wildcardCount || node.nodeObj?.data?.wildcardCount || 0;
        const isWildcardList = wildcardCount > 0;
        // Check if it's a category (not root, not wildcard item)
        const isCategory = !isRoot && !isWildcard;
        // A category that can have subcategories suggested (not a wildcard list)
        const canSuggestSubcategories = isCategory && !isWildcardList;

        console.log('[SmartMenu] Type:', { isWildcard, isRoot, isCategory, isWildcardList, wildcardCount });

        const items = menuEl.querySelectorAll('li');
        items.forEach(item => {
            const text = item.textContent?.toLowerCase().trim() || '';
            // Reset visibility first to ensure we don't permanently hide items
            item.style.display = 'block';

            // === Hide built-in Mind Elixir actions based on node type ===
            if (isWildcard) {
                // Hide actions irrelevant for wildcard items (leaf nodes)
                if (text.includes('child') || text.includes('summary')) {
                    console.log('[SmartMenu] Hiding for wildcard:', text);
                    item.style.display = 'none';
                }
            }
            if (isWildcardList) {
                // Wildcard list categories shouldn't add children via Mind Elixir
                // (children are wildcards managed differently)
                if (text.includes('add child')) {
                    console.log('[SmartMenu] Hiding "Add child" for wildcard list');
                    item.style.display = 'none';
                }
            }
            if (isRoot) {
                // Hide actions irrelevant for root
                if (text.includes('parent') || text.includes('sibling') || text.includes('remove') || text.includes('up') || text.includes('down') || text.includes('cut') || text.includes('copy')) {
                    console.log('[SmartMenu] Hiding for root:', text);
                    item.style.display = 'none';
                }
            }

            // === Hide custom AI actions based on node type ===
            // "Generate Wildcards" - only for wildcard lists (categories that have wildcards)
            if (text.includes('generate wildcards')) {
                if (!isWildcardList) {
                    console.log('[SmartMenu] Hiding "Generate Wildcards" (not a wildcard list)');
                    item.style.display = 'none';
                }
            }
            // "Suggest Subcategories" - only for folder categories (no wildcards)
            // (categories with wildcards are leaf-level, can't have subcategories)
            if (text.includes('suggest subcategories')) {
                if (!canSuggestSubcategories) {
                    console.log('[SmartMenu] Hiding "Suggest Subcategories" (is root, wildcard, or wildcard list)');
                    item.style.display = 'none';
                }
            }
        });
    },

    /**
     * Highlight nodes in the mindmap that match a search query
     * @param {string} query - Search query (empty string to clear highlights)
     */
    highlightSearch(query) {
        // Get containers for both main and dual mindmaps
        const containers = [
            document.getElementById('mindmap-container'),
            document.getElementById('dual-mindmap')
        ].filter(Boolean);

        // Clear previous highlights across all containers
        containers.forEach(container => {
            container.querySelectorAll('.mindmap-search-highlight').forEach(el => {
                el.classList.remove('mindmap-search-highlight');
            });
        });

        if (!query || !query.trim()) return [];

        const normalizedQuery = query.toLowerCase().trim();
        const matchedNodes = [];

        containers.forEach(container => {
            // Mind Elixir topic elements (various possible selectors)
            const topicSelectors = [
                '.mind-elixir-topic',
                '.me-topic',
                '[class*="topic"]',
                'me-tpc'
            ];

            topicSelectors.forEach(selector => {
                container.querySelectorAll(selector).forEach(topic => {
                    const text = topic.textContent?.toLowerCase() || '';
                    if (text.includes(normalizedQuery)) {
                        topic.classList.add('mindmap-search-highlight');
                        matchedNodes.push(topic);
                    }
                });
            });
        });

        // Auto-scroll/center to first match if in mindmap view
        if (matchedNodes.length > 0 && this.instance && this.currentView !== 'list') {
            const firstMatch = matchedNodes[0];
            try {
                firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            } catch (e) {
                // Fallback - center the view
                this.instance.toCenter?.();
            }
        }

        // Check for hidden wildcard matches when wildcards are collapsed
        if (!this.showWildcards && normalizedQuery) {
            const hiddenMatches = this.findHiddenWildcardMatches(normalizedQuery);
            if (hiddenMatches > 0) {
                this.showHiddenMatchesHint(hiddenMatches, query);
            } else {
                this.clearHiddenMatchesHint();
            }
        } else {
            this.clearHiddenMatchesHint();
        }

        return matchedNodes;
    },

    /**
     * Search State data for wildcards that match query (when wildcards are hidden)
     * @param {string} query - Normalized search query
     * @returns {number} Count of matching hidden wildcards
     */
    findHiddenWildcardMatches(query) {
        let count = 0;
        const normalizedQuery = query.toLowerCase();

        /**
         * Recursively search through wildcard data
         * @param {Object} obj - Object to search
         */
        const searchWildcards = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            // Check wildcards array
            if (obj.wildcards && Array.isArray(obj.wildcards)) {
                obj.wildcards.forEach(w => {
                    if (String(w).toLowerCase().includes(normalizedQuery)) {
                        count++;
                    }
                });
            }

            // Recurse into subcategories
            Object.entries(obj).forEach(([key, value]) => {
                if (typeof value === 'object' && value !== null && key !== 'wildcards' && key !== 'instruction') {
                    searchWildcards(value);
                }
            });
        };

        searchWildcards(State._rawData.wildcards);
        return count;
    },

    /**
     * Show a hint that hidden wildcards match the search
     * @param {number} count - Number of matching wildcards
     * @param {string} query - Original search query
     */
    showHiddenMatchesHint(count, query) {
        // Remove existing hint
        this.clearHiddenMatchesHint();

        const hint = document.createElement('div');
        hint.className = 'hidden-matches-hint';
        hint.innerHTML = `
            <span class="hint-icon">🔍</span>
            <span class="hint-text">
                Found <strong>${count}</strong> matching wildcard${count > 1 ? 's' : ''} (currently hidden)
            </span>
            <button class="show-wildcards-hint-btn" type="button">Show Wildcards</button>
        `;

        const btn = hint.querySelector('button');
        if (btn) {
            btn.onclick = () => {
                this.toggleWildcards(); // Show wildcards
                // Re-trigger search to apply highlights
                setTimeout(() => this.highlightSearch(query), 200);
            };
        }

        // Add to the appropriate container
        const container = document.getElementById('mindmap-container');
        if (container) {
            container.appendChild(hint);
        }
    },

    /**
     * Remove the hidden matches hint
     */
    clearHiddenMatchesHint() {
        document.querySelectorAll('.hidden-matches-hint').forEach(el => el.remove());
    },

    /**
     * Cleanup on destroy
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.instance) {
            this.instance.destroy?.();
            this.instance = null;
        }
        if (this.dualInstance) {
            this.dualInstance.destroy?.();
            this.dualInstance = null;
        }
        this.isInitialized = false;
        this.showWildcards = true; // Reset to default
    }
};

export { Mindmap, VIEW_MODES };
