import { sanitize } from '../utils.js';

export const Chip = (wildcard, index) => {
    return `
    <div class="chip chip-base text-sm px-2 py-1 rounded-md flex items-center gap-2 whitespace-nowrap" data-index="${index}">
        <input type="checkbox" aria-label="Select ${sanitize(wildcard)}" class="batch-select bg-gray-700 border-gray-500 text-indigo-600 focus:ring-indigo-500">
        <span class="editable-name chip-text outline-none rounded px-1" tabindex="0" aria-label="Double-click to edit item">${sanitize(wildcard)}</span>
    </div>`;
};
