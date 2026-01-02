import { State, effect } from '../state.js';
import { sanitize } from '../utils.js';

export class WildcardCategory extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.path = '';
        this.level = 0;
        this.cleanup = null;
    }

    static get observedAttributes() {
        return ['data-path', 'level'];
    }

    connectedCallback() {
        // Initial render logic
        this.shadowRoot.innerHTML = `
            <style>
                @import url('wildcards.css'); /* We might need to handle styles better with Shadow DOM */
                /* Basic reset for shadow DOM */
                :host { display: block; }
                /* Since external styles might not penetrate Shadow DOM easily unless we duplicate them or use parts */
                /* For now, I'll rely on global styles if I didn't use ShadowDOM, but the plan asked for ShadowDOM. */
                /* If using ShadowDOM, I must inject Tailwind/Custom CSS. */
                /* That is hard without a build step to inline CSS. */
                /* Alternative: Use <link rel="stylesheet"> in Shadow DOM */
            </style>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
            <link rel="stylesheet" href="css/wildcards.css">

            <details class="card-folder rounded-lg shadow-md group">
                <summary class="flex justify-between items-center p-4 cursor-pointer gap-4 group">
                     <!-- Header Content -->
                     <div class="flex items-center gap-3 flex-wrap flex-grow">
                        <slot name="checkbox"></slot>
                        <h2 class="text-xl font-semibold text-accent select-none"><span class="category-name"></span></h2>
                        <span class="instruction-text text-sm text-gray-400"></span>
                     </div>
                     <div class="actions flex items-center gap-2">
                        <slot name="actions"></slot>
                        <span class="arrow-down transition-transform duration-300">▼</span>
                     </div>
                </summary>
                <div class="content-wrapper p-4 border-t border-gray-700 flex flex-col gap-4">
                    <!-- Children Rendered Here -->
                </div>
            </details>
        `;

        this.summary = this.shadowRoot.querySelector('summary');
        this.details = this.shadowRoot.querySelector('details');
        this.nameEl = this.shadowRoot.querySelector('.category-name');
        this.instructionEl = this.shadowRoot.querySelector('.instruction-text');
        this.contentWrapper = this.shadowRoot.querySelector('.content-wrapper');

        this.subscribe();
    }

    disconnectedCallback() {
        if (this.cleanup) this.cleanup();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'data-path') {
            this.path = newValue;
            this.subscribe();
        }
        if (name === 'level') {
            this.level = parseInt(newValue);
            if (this.details) {
                 this.details.className = `card-folder rounded-lg shadow-md group level-${this.level}`;
                 // Tint logic can be added here
            }
        }
    }

    subscribe() {
        if (this.cleanup) this.cleanup();
        if (!this.path) return;

        const sig = State.getSignal(this.path);

        this.cleanup = effect(() => {
            const data = sig.value;
            if (!data) return; // Deleted or not ready

            const name = this.path.split('/').pop().replace(/_/g, ' ');
            this.nameEl.textContent = name;
            this.instructionEl.textContent = data.instruction || '';

            // Render Children
            // This is where it gets tricky. We need to sync the list of children.
            // A full re-render of children on every update is simpler but might break nested state.
            // But since children are also components, they handle their own internal updates!
            // So we only need to manage the LIST of children (add/remove).

            this.renderChildren(data);
        });
    }

    renderChildren(data) {
        // Diffing children
        const keys = Object.keys(data).filter(k => k !== 'instruction').sort();
        // Simple full re-render of children for V1 to ensure correctness
        // Optimizing this to diff is the next step for performance.

        // However, if we re-create <wildcard-category> elements, they lose their open state?
        // No, because state is in the URL/State or persisted?
        // Currently open state is DOM state.
        // If I destroy the element, I lose open state.
        // So I MUST diff.

        const existingChildren = Array.from(this.contentWrapper.children);
        const existingMap = new Map();
        existingChildren.forEach(el => {
            if (el.dataset.key) existingMap.set(el.dataset.key, el);
        });

        const newKeys = new Set(keys);

        // Remove old
        existingChildren.forEach(el => {
            if (el.dataset.key && !newKeys.has(el.dataset.key)) {
                el.remove();
            }
        });

        // Add/Update new
        keys.forEach(key => {
            const childPath = `${this.path}/${key}`;
            const childData = data[key];
            const isLeaf = childData && Array.isArray(childData.wildcards);

            let childEl = existingMap.get(key);

            if (!childEl) {
                if (isLeaf) {
                    childEl = document.createElement('wildcard-card');
                } else {
                    childEl = document.createElement('wildcard-category');
                }
                childEl.dataset.key = key;
                childEl.setAttribute('data-path', childPath);
                childEl.setAttribute('level', this.level + 1);
                this.contentWrapper.appendChild(childEl);
            } else {
                // Check if type changed (rare but possible)
                const wasLeaf = childEl.tagName === 'WILDCARD-CARD';
                if (isLeaf !== wasLeaf) {
                    childEl.replaceWith(
                        isLeaf ? document.createElement('wildcard-card') : document.createElement('wildcard-category')
                    );
                    // Re-setup attributes
                    const newEl = this.contentWrapper.lastElementChild; // or track it
                    newEl.dataset.key = key;
                    newEl.setAttribute('data-path', childPath);
                    newEl.setAttribute('level', this.level + 1);
                }
            }
        });
    }
}

customElements.define('wildcard-category', WildcardCategory);
