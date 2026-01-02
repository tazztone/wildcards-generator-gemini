import { State, effect } from '../state.js';
import { sanitize } from '../utils.js';
import { VirtualScroller } from '../utils/virtual-scroller.js';

export class WildcardCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.path = '';
        this.cleanup = null;
        this.scrollerInstance = null;
    }

    static get observedAttributes() {
        return ['data-path'];
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                @import url('wildcards.css');
                :host { display: block; }
                link { display: none; }
                .chips-container {
                    position: relative;
                    /* Ensure container has height for virtual scroller */
                    height: 150px;
                    overflow-y: auto;
                }
            </style>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
            <link rel="stylesheet" href="css/wildcards.css">

            <div class="card-wildcard p-4 rounded-lg flex flex-col level-auto">
                <div class="header flex justify-between items-center mb-2">
                    <h3 class="font-bold text-lg text-gray-100"><span class="name"></span> <span class="count text-gray-400 text-sm"></span></h3>
                    <slot name="actions"></slot>
                </div>
                <div class="instruction-wrapper my-2">
                    <input type="text" readonly class="instruction-input input-ghost w-full bg-transparent text-sm border-transparent" placeholder="Instructions...">
                </div>
                <!-- Fixed height container for virtual scrolling -->
                <div class="chips-container custom-scrollbar card-folder rounded-md p-2 w-full border border-gray-600">
                    <!-- Virtual Scroller injects here -->
                </div>
                <div class="footer mt-3">
                    <slot name="footer"></slot>
                </div>
            </div>
        `;

        this.nameEl = this.shadowRoot.querySelector('.name');
        this.countEl = this.shadowRoot.querySelector('.count');
        this.instructionInput = this.shadowRoot.querySelector('.instruction-input');
        this.chipsContainer = this.shadowRoot.querySelector('.chips-container');

        this.subscribe();
    }

    disconnectedCallback() {
        if (this.cleanup) this.cleanup();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'data-path' && oldValue !== newValue) {
            this.path = newValue;
            this.subscribe();
        }
    }

    subscribe() {
        if (this.cleanup) this.cleanup();
        if (!this.path) return;

        const sig = State.getSignal(this.path);

        this.cleanup = effect(() => {
            const data = sig.value;
            if (!data) return;

            const name = this.path.split('/').pop().replace(/_/g, ' ');
            this.nameEl.textContent = name;
            const wildcards = data.wildcards || [];
            this.countEl.textContent = `(${wildcards.length})`;
            this.instructionInput.value = data.instruction || '';

            // Use Virtual Scroller for chips
            // We need to recreate it if the list reference changes drastically,
            // or just update items if the scroller supports it.
            // Our simple VirtualScroller doesn't have update method yet, so we recreate.

            this.chipsContainer.innerHTML = ''; // Clear previous

            if (wildcards.length > 50) {
                 // Use virtual scrolling for large lists
                 this.scrollerInstance = new VirtualScroller(
                     this.chipsContainer,
                     wildcards,
                     (item, index) => {
                         const div = document.createElement('div');
                         div.className = "chip chip-base text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap overflow-hidden";
                         div.innerHTML = `<span>${sanitize(item)}</span>`;
                         return div;
                     },
                     32 // Approx item height in px
                 );
            } else {
                // Standard render for small lists (performance optimization not needed)
                this.chipsContainer.innerHTML = wildcards.map((w, i) => `
                    <div class="chip chip-base text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap">
                        <span>${sanitize(w)}</span>
                    </div>
                `).join('');
            }
        });
    }
}

customElements.define('wildcard-card', WildcardCard);
