import { sanitize } from '../utils.js';
import { Chip } from './Chip.js';

export const WildcardCard = {
    create(name, data, level, path) {
        const element = document.createElement('div');
        element.className = `card-wildcard p-4 rounded-lg flex flex-col level-${level} wildcard-card`;
        element.dataset.path = path;
        element.draggable = true;
        element.innerHTML = this.getHtml(name, data, path);
        return element;
    },

    getHtml(name, data, path) {
        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')).replace(/\//g, ' > ').replace(/_/g, ' ') : 'Top Level';
        return `
            <button class="delete-btn btn-action-icon absolute top-2 right-2 text-red-400 hover:text-red-300 transition-all duration-200 p-1 rounded hover:bg-red-400/10 z-10" title="Delete this card" aria-label="Delete this card">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
            <div class="text-xs text-gray-400 mb-1 uppercase tracking-wider">${sanitize(parentPath)}</div>
            <div class="flex justify-between items-center mb-2">
                <h3 class="font-bold text-lg text-gray-100 flex-grow editable-wrapper"><span class="editable-name wildcard-name outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit list name">${name.replace(/_/g, ' ')}</span><span class="edit-icon" title="Double-click to edit">✏️</span> <span class="wildcard-count text-gray-400 text-sm ml-2">(${(data.wildcards || []).length})</span></h3>
            </div>
            <div class="editable-wrapper w-full items-center my-2">
            <input type="text" readonly aria-label="Custom instructions" class="editable-input custom-instructions-input input-ghost bg-transparent text-sm border border-transparent rounded-md px-2 py-1 w-full focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200" placeholder="Custom generation instructions..." value="${sanitize(data.instruction || '')}">
            <span class="edit-icon" title="Double-click to edit">✏️</span>
        </div>
            <div class="chip-container custom-scrollbar flex flex-wrap gap-2 card-folder rounded-md p-2 w-full border border-gray-600 overflow-y-auto" style="max-height: 150px; min-height: 2.5rem;">
                ${(data.wildcards && data.wildcards.length > 0) ? data.wildcards.map((wc, i) => Chip(wc, i)).join('') : this.getEmptyListHtml()}
            </div>
            <div class="flex gap-2 mt-2">
                <input type="text" aria-label="New wildcard text" placeholder="Add new wildcard..." class="add-wildcard-input flex-grow input-primary px-2 py-1 text-sm">
                <button class="add-wildcard-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 rounded-md" aria-label="Add wildcard item">+
                </button>
            </div>
            <div class="flex justify-between items-center mt-3 flex-wrap gap-2">
                <button class="generate-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center gap-2 shadow-sm hover:shadow-md transition-all"><span class="btn-text">Generate More</span><div class="loader hidden"></div></button>
                <div class="flex gap-1 ml-auto">
                    <button class="copy-btn btn-secondary text-gray-400 hover:text-white p-2 rounded-md transition-colors" title="Copy all wildcards" aria-label="Copy all wildcards"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="select-all-btn btn-secondary text-xs py-1.5 px-2 rounded-md" title="Select All">Select All</button>
                    <button class="batch-delete-btn bg-red-900/50 hover:bg-red-700 text-red-200 hover:text-white text-xs py-1.5 px-2 rounded-md transition-colors" title="Delete Selected">Delete</button>
                </div>
            </div>
        `;
    },

    getEmptyListHtml() {
        return `
            <div class="empty-state w-full flex flex-col items-center justify-center text-gray-500 italic py-2 select-none">
                <span class="text-lg opacity-50" aria-hidden="true">📝</span>
                <span class="text-xs mt-1">No items yet. Add one or Generate.</span>
            </div>
        `;
    }
};
