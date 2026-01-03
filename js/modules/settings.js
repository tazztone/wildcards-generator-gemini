/**
 * Settings Module
 * Handles API key verification and settings-related operations.
 */

import { Api } from '../api.js';
import { UI } from '../ui.js';

export const Settings = {
    /**
     * Auto-verifies stored API keys on application startup.
     * Silently tests each provider's key and updates the UI accordingly.
     */
    async verifyStoredApiKeys() {
        const providers = ['openrouter', 'gemini', 'custom'];

        for (const provider of providers) {
            const panel = document.getElementById(`settings-${provider}`);
            if (!panel) continue;

            const input = panel.querySelector('.api-key-input');
            const key = input ? input.value.trim() : '';

            if (!key) continue;

            const btn = panel.querySelector('.test-conn-btn');
            if (!btn) continue;

            btn.disabled = true;
            btn.textContent = '⏳ ...';

            try {
                // Silent verification - no toast, just update button state
                const models = await Api.testConnection(provider, null, key);
                UI.populateModelList(provider, models);

                btn.textContent = '✓ Verified';
                btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                btn.classList.add('bg-green-600', 'hover:bg-green-700');

                // Reset after delay
                setTimeout(() => {
                    btn.textContent = '🔌 Test';
                    btn.disabled = false;
                    btn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                    btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                }, 2000);
            } catch (e) {
                console.warn(`Auto-verify failed for ${provider}:`, e);
                btn.textContent = '⚠️ Invalid';
                btn.className = 'test-conn-btn bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm whitespace-nowrap';
                btn.disabled = false;

                // Reset button on input change
                this._setupKeyResetListener(input, btn);
            }
        }
    },

    /**
     * Sets up a one-time listener to reset button state when API key input changes.
     * @param {HTMLInputElement} input - API key input element
     * @param {HTMLButtonElement} btn - Test connection button
     */
    _setupKeyResetListener(input, btn) {
        input.addEventListener('input', () => {
            if (btn.textContent === '⚠️ Invalid') {
                btn.textContent = '🔌 Test';
                btn.className = 'test-conn-btn bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm whitespace-nowrap';
            }
        }, { once: true });
    }
};
