import { sanitize } from '../utils.js';
import { State } from '../state.js';
import { WildcardCard } from './WildcardCard.js';

export const Category = {
    create(name, data, level, path, index = 0, sortKeysFn) {
        const element = document.createElement('details');
        element.className = `card-folder rounded-lg shadow-md group level-${level} category-item`;
        if (level === 0) {
            element.classList.add(`category-tint-${(index % 10) + 1}`);
        }
        element.dataset.path = path;
        element.draggable = true;

        element.innerHTML = this.getHtml(name, data, path);

        // Render children
        this.renderContent(element, data, path, level, sortKeysFn);

        return element;
    },

    getHtml(name, data, path) {
        const isPinned = State.state.pinnedCategories && State.state.pinnedCategories.includes(path);
        return `
            <summary class="flex justify-between items-center p-4 cursor-pointer gap-4 group">
                <div class="flex items-center gap-3 flex-wrap flex-grow">
                    <input type="checkbox" aria-label="Select category ${sanitize(name.replace(/_/g, ' '))}" class="category-batch-checkbox w-4 h-4 text-indigo-600 bg-gray-700 border-gray-500 rounded focus:ring-indigo-500" onclick="event.stopPropagation();">
                    <h2 class="text-xl font-semibold text-accent select-none editable-wrapper"><span class="editable-name category-name outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit category name">${name.replace(/_/g, ' ')}</span><span class="edit-icon" title="Double-click to edit">✏️</span></h2>
                    <div class="editable-wrapper flex-grow items-center">
                    <input type="text" readonly aria-label="Folder instructions" class="editable-input custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500 w-full transition-all duration-200" placeholder="Folder instructions..." style="min-width: 200px;" value="${sanitize(data.instruction || '')}">
                    <span class="edit-icon" title="Double-click to edit">✏️</span>
                </div>
                </div>
                <div class="flex items-center gap-2 ml-auto flex-shrink-0">
                    <button class="pin-btn btn-action-icon text-yellow-400 hover:text-yellow-300 text-lg transition-all duration-200" title="${isPinned ? 'Unpin' : 'Pin to top'}" aria-label="${isPinned ? 'Unpin category' : 'Pin category'}">${isPinned ? '📌' : '📍'}</button>
                    <button class="delete-btn btn-action-icon text-red-400 hover:text-red-300 transition-all duration-200 p-1 rounded hover:bg-red-400/10" title="Delete this category" aria-label="Delete this category">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                    <span class="arrow-down transition-transform duration-300 text-accent"><svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
                </div>
            </summary>
            <div class="content-wrapper p-4 border-t border-gray-700 flex flex-col gap-4"></div>
        `;
    },

    renderContent(element, data, path, level, sortKeysFn) {
        const contentWrapper = element.querySelector('.content-wrapper');
        contentWrapper.innerHTML = '';

        let keys = Object.keys(data).filter(k => k !== 'instruction');
        const sortedKeys = sortKeysFn ? sortKeysFn(keys, path) : keys.sort();

        const leafNodes = [];
        const nonLeafNodes = [];

        for (const key of sortedKeys) {
            const childData = data[key];
            const childIsLeaf = childData && typeof childData === 'object' && Array.isArray(childData.wildcards);
            const childPath = `${path}/${key}`;

            if (childIsLeaf) {
                leafNodes.push(WildcardCard.create(key, childData, level + 1, childPath));
            } else if (typeof childData === 'object' && childData !== null) {
                nonLeafNodes.push(Category.create(key, childData, level + 1, childPath, 0, sortKeysFn));
            }
        }

        nonLeafNodes.forEach(node => contentWrapper.appendChild(node));

        // Visual Separator for DnD
        const separator = document.createElement('div');
        separator.className = 'dnd-separator';
        separator.dataset.path = path; // The category path
        contentWrapper.appendChild(separator);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full';
        leafNodes.forEach(node => gridWrapper.appendChild(node));

        // Placeholders
        gridWrapper.appendChild(this.createWildcardPlaceholder(path));

        contentWrapper.appendChild(this.createSubcategoryPlaceholder(path));
        contentWrapper.appendChild(gridWrapper);
    },

    createSubcategoryPlaceholder(parentPath) {
        const div = document.createElement('div');
        div.className = 'bg-gray-800/50 p-4 rounded-lg flex items-center justify-between border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors mt-2 mb-4';
        div.dataset.parentPath = parentPath;
        div.innerHTML = `
            <span class="text-gray-400 font-medium">Add new subcategory</span>
            <div class="flex gap-2">
                <button class="add-subcategory-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md" aria-label="Add new subcategory">+</button>
                <button class="suggest-subcategory-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-md">Suggest</button>
            </div>
        `;
        return div;
    },

    createWildcardPlaceholder(parentPath) {
        const div = document.createElement('div');
        div.className = 'bg-gray-700/50 p-4 rounded-lg flex flex-col min-h-[288px]';
        div.dataset.parentPath = parentPath;
        div.innerHTML = `
             <div class="flex-grow flex flex-col items-center justify-center text-center">
                 <p class="text-gray-400 mb-4">Add new wildcard list</p>
                 <div class="flex gap-4">
                    <button class="add-wildcard-list-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-2xl" aria-label="Add new wildcard list">+</button>
                    <button class="suggest-wildcard-list-btn bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Suggest</button>
                </div>
            </div>`;
        return div;
    },

    // Add missing method for top-level placeholder
    createPlaceholderCategory(parentPath) {
        // Compatibility wrapper for top level
        const div = document.createElement('div');
        div.className = 'placeholder-category card-folder rounded-lg shadow-md mt-4';
        div.innerHTML = `
            <div class="p-4 flex flex-wrap justify-between items-center gap-4">
                <h2 class="text-xl sm:text-2xl font-semibold text-accent">Add New Top-Level Category</h2>
                <div class="flex items-center gap-2">
                    <button id="add-category-placeholder-btn" class="add-category-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md" aria-label="Add new top-level category">+</button>
                    <button id="suggest-toplevel-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Suggest</button>
                </div>
            </div>`;
        return div;
    }
};
