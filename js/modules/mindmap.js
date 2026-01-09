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
    showWildcards: true, // Start expanded by default
    _currentDuplicates: null, // Store duplicates for reapplication on view change
    _isFilterMode: false, // Track if filter mode is active

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
            const hasWildcards = wildcardCount > 0;

            // Build display name with count indicator when wildcards are hidden
            const displayName = (!showWildcards && hasWildcards)
                ? `${name} (${wildcardCount})`
                : name;

            // Determine node type for styling:
            // - Category/Subcategory: nodes without wildcards (only contains subcategories)
            // - WildcardList: nodes that have wildcards array
            const isWildcardList = hasWildcards;

            // Style based on node type for consistent appearance:
            // - Categories/Subcategories: outlined style (blue border, transparent bg)
            // - WildcardLists: distinct filled style (subtle background)
            const nodeStyle = isWildcardList
                ? {
                    // WildcardList style: subtle filled background
                    fontSize: String(Config.MINDMAP_FONT_SIZE_LIST || 64),
                    background: 'var(--bg-tertiary, #374151)',
                    color: 'var(--text-secondary, #9ca3af)'
                }
                : {
                    // Category/Subcategory style: outlined (handled via CSS class)
                    fontSize: String(Config.MINDMAP_FONT_SIZE_CATEGORY || 96) // Values must be string for Mind Elixir
                };

            const node = {
                id: generateId(path),
                topic: displayName,
                children: [],
                // Store original path for sync back
                data: {
                    path: path.split('/'),
                    originalName: name,
                    wildcardCount: wildcardCount,
                    isWildcardList: isWildcardList
                },
                style: nodeStyle
            };

            // Add instruction as a tooltip (note) on hover instead of visible tag
            if (data.instruction && typeof data.instruction === 'string') {
                node.note = data.instruction;
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
                        // Wildcard style: most basic/simple - minimal styling
                        style: {
                            fontSize: String(Config.MINDMAP_FONT_SIZE_WILDCARD || 20),
                            background: 'transparent',
                            color: 'var(--text-muted, #6b7280)'
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
                    // Check for instruction in note (tooltip)
                    if (child.note) {
                        subcategories[child.topic].instruction = child.note;
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
                // Add instruction if present (stored in note)
                if (categoryNode.note) {
                    wildcards[categoryNode.topic].instruction = categoryNode.note;
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
            scaleMin: 0.2,
            scaleMax: 2,
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

        // Auto-center and zoom to fit at minimum zoom for maximum overview
        setTimeout(() => {
            instance.toCenter();
            instance.scale(0.2); // Start at minimum zoom for maximum overview
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

    },

    /**
     * Setup bidirectional event listeners
     * @param {MindElixirInstance} instance - Mind Elixir instance
     * @param {string} containerSelector - Container selector for context
     */
    setupEventListeners(instance, containerSelector) {
        // Mind Elixir → State sync AND focus mode detection
        instance.bus.addListener('operation', (operation) => {
            if (this._syncLock) return;

            // Detect focus mode operations
            if (operation.name === 'focusNode' || operation.name === 'focus') {

                this.showFocusModeExitButton(instance);
            } else if (operation.name === 'cancelFocus' || operation.name === 'unfocus') {

                this.hideFocusModeExitButton();
            }

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
     * Show floating button to exit focus mode
     * @param {MindElixirInstance} instance - The Mind Elixir instance
     */
    showFocusModeExitButton(instance) {
        // Remove existing button if any
        this.hideFocusModeExitButton();

        const btn = document.createElement('button');
        btn.id = 'mindmap-exit-focus-btn';
        btn.className = 'mindmap-exit-focus-btn';
        btn.innerHTML = `
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Exit Focus Mode
        `;
        btn.title = 'Exit focus mode and show all nodes';
        btn.onclick = () => {
            // @ts-ignore - cancelFocus exists at runtime but not in type definitions
            instance.cancelFocus?.();
            this.hideFocusModeExitButton();
        };

        // Add to mindmap container
        const container = document.getElementById('mindmap-container') || document.getElementById('dual-mindmap');
        if (container) {
            container.appendChild(btn);
        }
    },

    /**
     * Hide the focus mode exit button
     */
    hideFocusModeExitButton() {
        const btn = document.getElementById('mindmap-exit-focus-btn');
        if (btn) btn.remove();
    },

    /**
     * Handle Mind Elixir operations and sync to State
     * @param {Object} operation - Operation object from Mind Elixir
     * @param {MindElixirInstance} instance - The Mind Elixir instance
     */
    handleMindmapOperation(operation, instance) {


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
        this.updateToggleButtonState();

        // Reapply duplicate highlights if they were active
        if (this._currentDuplicates && this._currentDuplicates.length > 0) {
            // Small delay to ensure DOM is ready after view switch
            setTimeout(() => {
                if (this._isFilterMode) {
                    this.filterToDuplicates(this._currentDuplicates);
                } else {
                    this.highlightDuplicates(this._currentDuplicates);
                }
            }, 300);
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

            // Toggle in List View - hide/show chip containers (the actual wildcard content)
            // This keeps the category structure visible while hiding just the wildcard chips
            const listContainer = document.getElementById('wildcard-container');
            const dualListContainer = document.getElementById('dual-list');

            [listContainer, dualListContainer].filter(Boolean).forEach(container => {
                // Toggle visibility of chip containers only (the actual wildcard chips)
                // Keep the card header (title, description, count) visible
                container.querySelectorAll('.chip-container').forEach(chipContainer => {
                    chipContainer.classList.toggle('hidden', !this.showWildcards);
                });

                // Also toggle the add input row (hidden by default anyway, but ensure it stays hidden)
                container.querySelectorAll('.add-input-row').forEach(row => {
                    if (!this.showWildcards) row.classList.add('hidden');
                });
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
     * Update the toggle button visual state to match internal state (icon-only)
     */
    updateToggleButtonState() {
        const toggleBtn = document.getElementById('mindmap-toggle-wildcards');
        if (!toggleBtn) return;

        // Toggle active class (affects background color)
        toggleBtn.classList.toggle('active', this.showWildcards);

        // Toggle icon visibility
        const eyeOpen = toggleBtn.querySelector('.eye-open');
        const eyeClosed = toggleBtn.querySelector('.eye-closed');

        if (eyeOpen) eyeOpen.classList.toggle('hidden', !this.showWildcards);
        if (eyeClosed) eyeClosed.classList.toggle('hidden', this.showWildcards);

        // Update tooltip
        toggleBtn.title = this.showWildcards ?
            'Hide wildcards (show categories only)' :
            'Show wildcards';
    },

    /**
     * Force wildcards to be shown (used by Dupe Finder mode)
     */
    forceShowWildcards() {
        if (!this.showWildcards) {
            this.toggleWildcards();
        }
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



        const items = menuEl.querySelectorAll('li');
        items.forEach(item => {
            const text = item.textContent?.toLowerCase().trim() || '';
            // Reset visibility first to ensure we don't permanently hide items
            item.style.display = 'block';

            // === Hide built-in Mind Elixir actions based on node type ===
            if (isWildcard) {
                // Hide actions irrelevant for wildcard items (leaf nodes)
                if (text.includes('child') || text.includes('summary')) {

                    item.style.display = 'none';
                }
            }
            if (isWildcardList) {
                // Wildcard list categories shouldn't add children via Mind Elixir
                // (children are wildcards managed differently)
                if (text.includes('add child')) {

                    item.style.display = 'none';
                }
            }
            if (isRoot) {
                // Hide actions irrelevant for root
                if (text.includes('parent') || text.includes('sibling') || text.includes('remove') || text.includes('up') || text.includes('down') || text.includes('cut') || text.includes('copy')) {

                    item.style.display = 'none';
                }
            }

            // === Hide custom AI actions based on node type ===
            // "Generate Wildcards" - only for wildcard lists (categories that have wildcards)
            if (text.includes('generate wildcards')) {
                if (!isWildcardList) {

                    item.style.display = 'none';
                }
            }
            // "Suggest Subcategories" - only for folder categories (no wildcards)
            // (categories with wildcards are leaf-level, can't have subcategories)
            if (text.includes('suggest subcategories')) {
                if (!canSuggestSubcategories) {

                    item.style.display = 'none';
                }
            }

            // === Focus Mode actions ===
            // "Focus Mode" - only for categories (not wildcards), and add click handler
            if (text.includes('focus mode') && !text.includes('cancel')) {
                if (isWildcard) {

                    item.style.display = 'none';
                } else {
                    // Add click handler to show exit button when Focus Mode is activated
                    item.addEventListener('click', () => {

                        setTimeout(() => this.showFocusModeExitButton(this.instance), 100);
                    }, { once: true });
                }
            }
            // "Cancel Focus Mode" - always hide (replaced with floating button)
            if (text.includes('cancel focus mode')) {

                item.style.display = 'none';
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
     * Highlight duplicate wildcards in the mindmap
     * @param {Array} duplicates - Array of duplicate objects with normalized names
     */
    highlightDuplicates(duplicates) {
        if (!duplicates || duplicates.length === 0) return 0;

        // Build a set of normalized duplicate names for quick lookup
        const duplicateSet = new Set(duplicates.map(d => d.normalized));

        let totalCount = 0;

        // Get all mindmap containers (main and dual)
        const containers = [
            document.getElementById('mindmap-container'),
            document.getElementById('dual-mindmap')
        ].filter(Boolean);

        if (containers.length === 0) return 0;

        containers.forEach(container => {
            // Mind Elixir uses custom <me-tpc> elements for topic nodes
            // The text is inside <span class="text"> within me-tpc
            const topicElements = container.querySelectorAll('me-tpc');

            topicElements.forEach(tpc => {
                // Get the text from the .text span or fall back to innerText
                const textSpan = tpc.querySelector('.text');
                const text = (textSpan?.textContent || tpc.textContent || '').toLowerCase().trim();

                if (text && duplicateSet.has(text)) {
                    tpc.classList.add('mindmap-node-duplicate');
                    totalCount++;
                }
            });
        });

        // Store duplicates for reapplication on view change
        this._currentDuplicates = duplicates;

        return totalCount;
    },

    /**
     * Apply filter mode to show only nodes with duplicates
     * @param {Array} duplicates - Array of duplicate objects with locations
     */
    filterToDuplicates(duplicates) {
        if (!duplicates || duplicates.length === 0) return;

        // Track filter mode state
        this._isFilterMode = true;
        this._currentDuplicates = duplicates;

        // Collect all paths that have duplicates
        const paths = new Set();
        duplicates.forEach(d => d.locations.forEach(loc => paths.add(loc.path)));

        // For mindmap view, re-render with filtered data
        if (this.currentView === VIEW_MODES.MINDMAP || this.currentView === VIEW_MODES.DUAL) {
            // Build a filtered version of wildcards containing only relevant paths
            const filteredData = this._filterDataToPaths(State._rawData.wildcards || {}, paths);

            // Re-render mindmap with filtered data
            if (this.instance) {
                try {
                    const data = this.transformToMindElixir(filteredData);
                    this.instance.refresh(data);
                    setTimeout(() => this.instance.toCenter(), 100);
                } catch (error) {
                    console.error('Error filtering mindmap:', error);
                }
            }

            if (this.dualInstance) {
                try {
                    const data = this.transformToMindElixir(filteredData);
                    this.dualInstance.refresh(data);
                } catch (error) {
                    console.error('Error filtering dual mindmap:', error);
                }
            }

            // Highlight duplicate nodes
            setTimeout(() => this.highlightDuplicates(duplicates), 200);
        }

        this.showFilterModeExitButton();

        // Show filter mode indicator
        const container = document.getElementById('mindmap-container');
        if (container && !container.querySelector('.filter-mode-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'filter-mode-indicator';
            indicator.innerHTML = `
                <span class="indicator-icon">🔍</span>
                <span class="indicator-text">Filter Mode: Showing ${paths.size} lists with duplicates</span>
            `;
            container.appendChild(indicator);
        }
    },

    /**
     * Filter wildcards data to only include paths that contain duplicates
     * @param {Object} wildcards - Original wildcards data
     * @param {Set<string>} paths - Set of paths that should be included
     * @returns {Object} Filtered wildcards data
     */
    _filterDataToPaths(wildcards, paths) {
        const result = {};

        /**
         * Check if a path or any of its descendants is in the paths set
         * @param {string} currentPath - Path to check
         * @returns {boolean}
         */
        const hasMatchingDescendant = (currentPath) => {
            for (const path of paths) {
                if (path === currentPath || path.startsWith(currentPath + '/')) {
                    return true;
                }
            }
            return false;
        };

        /**
         * Recursively filter the data structure
         * @param {Object} data - Data to filter
         * @param {string} basePath - Current base path
         * @returns {Object|null} Filtered data or null if no matches
         */
        const filterRecursive = (data, basePath = '') => {
            const filtered = {};
            let hasContent = false;

            for (const key of Object.keys(data)) {
                if (key === 'instruction') {
                    // Always include instructions for included categories
                    continue;
                }

                const value = data[key];
                const currentPath = basePath ? `${basePath}/${key}` : key;

                if (value && typeof value === 'object') {
                    // Check if this path or any descendant matches
                    if (hasMatchingDescendant(currentPath)) {
                        // It's a wildcard list
                        if (Array.isArray(value.wildcards)) {
                            // Only include if this exact path has duplicates
                            if (paths.has(currentPath)) {
                                filtered[key] = { ...value };
                                if (data[key].instruction) {
                                    filtered[key].instruction = data[key].instruction;
                                }
                                hasContent = true;
                            }
                        } else {
                            // It's a category - recurse
                            const childFiltered = filterRecursive(value, currentPath);
                            if (childFiltered && Object.keys(childFiltered).length > 0) {
                                filtered[key] = childFiltered;
                                if (value.instruction) {
                                    filtered[key].instruction = value.instruction;
                                }
                                hasContent = true;
                            }
                        }
                    }
                }
            }

            return hasContent ? filtered : null;
        };

        const filteredResult = filterRecursive(wildcards);
        return filteredResult || {};
    },

    /**
     * Clear duplicate highlights from the mindmap
     */
    clearDuplicateHighlights() {
        // Clear state tracking
        this._currentDuplicates = null;
        this._isFilterMode = false;

        // Remove duplicate styling from mindmap nodes
        document.querySelectorAll('.mindmap-node-duplicate').forEach(el => {
            el.classList.remove('mindmap-node-duplicate');
        });

        // Remove filter mode indicator
        document.querySelectorAll('.filter-mode-indicator').forEach(el => el.remove());

        // Hide the filter exit button
        this.hideFilterModeExitButton();
    },

    /**
     * Show floating bar to exit filter mode (Duplicate Finder)
     */
    showFilterModeExitButton() {
        // Remove existing button if any
        this.hideFilterModeExitButton();

        const bar = document.createElement('div');
        bar.id = 'dupe-finder-bar';
        bar.className = 'dupe-finder-bar';
        bar.innerHTML = `
            <button id="clean-duplicates-btn-mm" class="btn-clean">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                🧹 Clean Duplicates
            </button>
            <button id="exit-filter-btn-mm" class="btn-exit">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Exit Dupe Finder
            </button>
        `;

        // Wire up buttons
        bar.querySelector('#clean-duplicates-btn-mm').addEventListener('click', () => {
            // Import UI dynamically
            import('../ui.js').then(({ UI }) => {
                const { duplicates } = State.findDuplicates();
                UI.showCleanDuplicatesDialog(duplicates);
            });
        });

        bar.querySelector('#exit-filter-btn-mm').addEventListener('click', () => {
            // Import UI dynamically
            import('../ui.js').then(({ UI }) => {
                UI.clearDuplicateHighlights();
            });
        });

        // Add to the appropriate container based on current view
        let container;
        if (this.currentView === VIEW_MODES.MINDMAP) {
            container = document.getElementById('mindmap-container');
        } else {
            container = document.getElementById('wildcard-container')?.parentElement;
        }

        if (container) {
            // Ensure the container can position the button
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(bar);
        }
    },

    /**
     * Hide the filter mode exit button
     */
    hideFilterModeExitButton() {
        const bar = document.getElementById('dupe-finder-bar');
        if (bar) bar.remove();
        // Legacy support
        const btn = document.getElementById('exit-filter-btn');
        if (btn) btn.remove();
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
