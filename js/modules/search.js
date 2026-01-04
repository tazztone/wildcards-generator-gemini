export const Search = {
    init(searchInput, clearBtn, resultsCount, container) {
        if (!searchInput) return;

        this.searchInput = searchInput;
        this.clearBtn = clearBtn;
        this.resultsCount = resultsCount;
        this.container = container;
        this.searchTimeout = null;

        this.bindEvents();
    },

    bindEvents() {
        this.searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (this.clearBtn) {
                if (val && val.length > 0) this.clearBtn.classList.remove('hidden');
                else this.clearBtn.classList.add('hidden');
            }
            // Debounced search execution
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.execute(val);
            }, 300);
        });

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                this.searchInput.value = '';
                this.clearBtn.classList.add('hidden');
                this.searchInput.focus();
                this.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    },

    execute(query) {
        const normalizedQuery = query.toLowerCase().trim();
        let matchCount = 0;

        const scan = (el) => {
            let hasMatch = false;

            const nameEl = el.querySelector('.category-name, .wildcard-name');
            const name = nameEl ? nameEl.textContent.toLowerCase() : '';

            let wildcardsMatch = false;
            if (el.classList.contains('wildcard-card')) {
                const chips = el.querySelectorAll('.chip span[contenteditable]');
                chips.forEach(chip => {
                    if (chip.textContent.toLowerCase().includes(normalizedQuery)) wildcardsMatch = true;
                });
            }

            if (normalizedQuery === '' || name.includes(normalizedQuery) || wildcardsMatch) {
                hasMatch = true;
                matchCount++;
            }

            if (el.tagName === 'DETAILS') {
                const children = el.querySelectorAll(':scope > .content-wrapper > .category-item, :scope > .content-wrapper > .grid > .wildcard-card');
                let childMatched = false;
                children.forEach(child => {
                    if (scan(child)) childMatched = true;
                });

                if (childMatched) {
                    hasMatch = true;
                    el.open = true;
                }
            }

            if (hasMatch || normalizedQuery === '') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }

            return hasMatch;
        };

        const topLevel = this.container.querySelectorAll(':scope > .category-item');
        topLevel.forEach(el => scan(el));

        if (this.resultsCount) {
            this.resultsCount.textContent = normalizedQuery ? `${matchCount} matches` : '';
        }
    }
};
