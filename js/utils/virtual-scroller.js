// A simple Virtual Scroller helper
export class VirtualScroller {
    constructor(container, items, createItemFn, itemHeight = 50) {
        this.container = container;
        this.items = items;
        this.createItemFn = createItemFn;
        this.itemHeight = itemHeight;

        this.scroller = document.createElement('div');
        this.scroller.style.position = 'relative';
        this.container.appendChild(this.scroller);

        this.totalHeight = items.length * itemHeight;
        this.scroller.style.height = `${this.totalHeight}px`;

        this.visibleItems = new Map();

        // Find scroll parent
        this.scrollParent = this.getScrollParent(container);
        this.scrollParent.addEventListener('scroll', () => this.onScroll());
        this.onScroll(); // Initial
    }

    getScrollParent(node) {
        if (node == null) return document.body;
        if (node.scrollHeight > node.clientHeight) return node;
        return this.getScrollParent(node.parentNode);
    }

    onScroll() {
        const scrollTop = this.scrollParent.scrollTop;
        const viewportHeight = this.scrollParent.clientHeight;

        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = Math.min(
            this.items.length - 1,
            Math.floor((scrollTop + viewportHeight) / this.itemHeight)
        );

        // Render range + buffer
        const buffer = 5;
        const renderStart = Math.max(0, startIndex - buffer);
        const renderEnd = Math.min(this.items.length - 1, endIndex + buffer);

        const renderedIndices = new Set();

        for (let i = renderStart; i <= renderEnd; i++) {
            renderedIndices.add(i);
            if (!this.visibleItems.has(i)) {
                const itemData = this.items[i];
                const el = this.createItemFn(itemData, i);
                el.style.position = 'absolute';
                el.style.top = `${i * this.itemHeight}px`;
                el.style.width = '100%';
                this.scroller.appendChild(el);
                this.visibleItems.set(i, el);
            }
        }

        // Cleanup
        for (const [index, el] of this.visibleItems.entries()) {
            if (!renderedIndices.has(index)) {
                el.remove();
                this.visibleItems.delete(index);
            }
        }
    }
}
