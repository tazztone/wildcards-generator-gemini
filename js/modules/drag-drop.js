/**
 * Drag and Drop Module
 * Handles all drag-and-drop functionality for reordering categories and wildcards.
 */

import { State } from '../state.js';
import { UI } from '../ui.js';

export const DragDrop = {
    /**
     * Reference to the currently dragged item's path.
     * Managed by the App module.
     */
    draggedPath: null,

    /**
     * Sets the dragged path reference.
     * @param {string|null} path 
     */
    setDraggedPath(path) {
        this.draggedPath = path;
    },

    /**
     * Gets the current dragged path.
     * @returns {string|null}
     */
    getDraggedPath() {
        return this.draggedPath;
    },

    /**
     * Handles the dragstart event.
     * @param {DragEvent} e 
     */
    handleDragStart(e) {
        const target = e.target.closest('[data-path]');
        if (target) {
            this.draggedPath = target.dataset.path;
            e.dataTransfer.setData('text/plain', this.draggedPath);
            e.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => target.classList.add('dragging'));
            document.body.classList.add('dragging-active');
        }
    },

    /**
     * Handles the dragover event - manages visual drop indicators.
     * @param {DragEvent} e 
     */
    handleDragOver(e) {
        e.preventDefault();
        const target = e.target.closest('[data-path]');
        if (!target || target.dataset.path === this.draggedPath) return;

        // Clean up any existing classes on other elements
        document.querySelectorAll('.drop-target-active, .drop-line-before, .drop-line-after, .drop-inside').forEach(el => {
            if (el !== target) {
                el.classList.remove('drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside');
            }
        });

        const rect = target.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

        target.classList.add('drop-target-active');

        // Remove all position classes first
        target.classList.remove('drop-line-before', 'drop-line-after', 'drop-inside');

        // Check for separator
        if (target.classList.contains('dnd-separator')) {
            target.classList.add('drop-inside');
            return;
        }

        // If it's a category (details), allow dropping inside
        const isCategory = target.tagName === 'DETAILS';

        if (isCategory && relY > height * 0.25 && relY < height * 0.75) {
            target.classList.add('drop-inside');
        } else if (relY < height / 2) {
            target.classList.add('drop-line-before');
        } else {
            target.classList.add('drop-line-after');
        }
    },

    /**
     * Handles the dragleave event - cleans up visual indicators.
     * @param {DragEvent} e 
     */
    handleDragLeave(e) {
        const target = e.target.closest('[data-path]');
        if (target) {
            target.classList.remove('drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside');
        }
    },

    /**
     * Handles the drop event - executes the move operation.
     * @param {DragEvent} e 
     */
    handleDrop(e) {
        e.preventDefault();
        const target = e.target.closest('[data-path]');

        // Capture draggedPath before cleanup
        const srcPath = this.draggedPath;
        this.handleDragEnd(e); // Clean visuals immediately

        if (!target || !srcPath) return;

        const destPath = target.dataset.path;

        if (srcPath === destPath) return;

        // Determine position based on cursor location
        const rect = target.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;
        let position = 'after';
        const isCategory = target.tagName === 'DETAILS';
        const isSeparator = target.classList.contains('dnd-separator');

        if (isSeparator) {
            position = 'inside';
        } else if (isCategory && relY > height * 0.25 && relY < height * 0.75) {
            position = 'inside';
        } else if (relY < height / 2) {
            position = 'before';
        }

        // Execute Move
        State.saveStateToHistory();
        this.moveItem(srcPath, destPath, position);
    },

    /**
     * Moves an item from source path to destination path.
     * @param {string} srcPath - Source item path
     * @param {string} destPath - Destination item path
     * @param {string} position - 'before', 'after', or 'inside'
     */
    moveItem(srcPath, destPath, position) {
        // 1. Get Source Data
        const srcParent = State.getParentObjectByPath(srcPath);
        const srcKey = srcPath.split('/').pop();
        const srcData = srcParent[srcKey];

        // 2. Identify Dest Parent and Key
        let destParent;

        if (position === 'inside') {
            destParent = State.getObjectByPath(destPath);
            // Ensure it's not a wildcard leaf
            if (Array.isArray(destParent.wildcards)) {
                UI.showToast("Cannot drop inside a wildcard list", 'error');
                return;
            }
        } else {
            destParent = State.getParentObjectByPath(destPath);
        }

        // Validation: Cannot move parent inside child
        if (destPath.startsWith(srcPath + '/')) {
            UI.showToast("Cannot move parent inside child", 'error');
            return;
        }

        // 3. Check for key collision in destination
        if (destParent[srcKey]) {
            UI.showToast("Item with this name already exists in destination", 'error');
            return;
        }

        // 4. Remove from Source
        delete srcParent[srcKey];

        // 5. Insert into Destination
        destParent[srcKey] = srcData;

        // Note: Current architecture uses alphabetically sorted Object keys.
        // 'before'/'after' positions work for selecting the target parent,
        // but final order is determined by alphabetical sorting in render.
    },

    /**
     * Handles the dragend event - final cleanup.
     * @param {DragEvent} e 
     */
    handleDragEnd(e) {
        this.draggedPath = null;
        document.body.classList.remove('dragging-active');
        document.querySelectorAll('.dragging, .drop-target-active, .drop-line-before, .drop-line-after, .drop-inside')
            .forEach(el => el.classList.remove('dragging', 'drop-target-active', 'drop-line-before', 'drop-line-after', 'drop-inside'));
    },

    /**
     * Binds drag-and-drop event listeners to a container element.
     * @param {HTMLElement} container 
     */
    bindEvents(container) {
        container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        container.addEventListener('dragover', (e) => this.handleDragOver(e));
        container.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        container.addEventListener('drop', (e) => this.handleDrop(e));
        container.addEventListener('dragend', (e) => this.handleDragEnd(e));
    }
};
