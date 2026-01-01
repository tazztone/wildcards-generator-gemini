import { test, expect } from '@playwright/test';

test.describe('API Logic Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for Api to be exposed
        await page.waitForFunction(() => typeof window.Api !== 'undefined');
    });

    // ... existing _prepareRequest and _parseResponse tests ...
    test('should prepare request correctly for Gemini', async ({ page }) => {
        await page.evaluate(() => {
            document.body.innerHTML = `
                <select id="api-endpoint"><option value="gemini" selected>Gemini</option></select>
                <input id="gemini-api-key" value="test-key">
                <input id="gemini-model-name" value="gemini-1.5-flash">
            `;
            const result = window.Api._prepareRequest('System Prompt', 'User Prompt');
            if (!result.url.includes('generativelanguage.googleapis.com')) throw new Error('Wrong URL for Gemini');
            if (!result.url.includes('key=test-key')) throw new Error('API Key missing in URL');
            if (result.payload.contents[0].parts[0].text !== 'System Prompt') throw new Error('System prompt missing');
        });
    });

    test('should prepare request correctly for OpenRouter', async ({ page }) => {
        await page.evaluate(() => {
            document.body.innerHTML = `
                <select id="api-endpoint"><option value="openrouter" selected>OpenRouter</option></select>
                <input id="openrouter-api-key" value="sk-or-test">
                <input id="openrouter-model-name" value="openai/gpt-4">
            `;
            const result = window.Api._prepareRequest('System', 'User');
            if (result.url !== 'https://openrouter.ai/api/v1/chat/completions') throw new Error('Wrong URL for OpenRouter');
            if (result.headers['Authorization'] !== 'Bearer sk-or-test') throw new Error('Auth header missing');
            if (result.payload.model !== 'openai/gpt-4') throw new Error('Wrong model');
            if (result.payload.response_format.type !== 'json_object') throw new Error('Missing JSON format');
        });
    });

    test('should prepare request correctly for Custom API', async ({ page }) => {
        await page.evaluate(() => {
            document.body.innerHTML = `
                <select id="api-endpoint"><option value="custom" selected>Custom</option></select>
                <input id="custom-api-url" value="http://localhost:1234/v1">
                <input id="custom-api-key" value="custom-key">
                <input id="custom-model-name" value="llama-local">
            `;
            const result = window.Api._prepareRequest('System', 'User');
            if (result.url !== 'http://localhost:1234/v1/chat/completions') throw new Error('Wrong URL for Custom API');
            if (result.headers['Authorization'] !== 'Bearer custom-key') throw new Error('Auth header missing');
            if (result.payload.model !== 'llama-local') throw new Error('Wrong model');
        });
    });

    test('should parse Gemini response correctly', async ({ page }) => {
        const result = await page.evaluate(() => {
            document.body.innerHTML = `<select id="api-endpoint"><option value="gemini" selected>Gemini</option></select>`;
            const mockResponse = {
                candidates: [{
                    content: {
                        parts: [{ text: JSON.stringify(["item1", "item2"]) }]
                    }
                }]
            };
            return window.Api._parseResponse(mockResponse);
        });
        expect(result).toEqual(["item1", "item2"]);
    });

    test('should parse OpenRouter response correctly (JSON string)', async ({ page }) => {
        const result = await page.evaluate(() => {
            document.body.innerHTML = `<select id="api-endpoint"><option value="openrouter" selected>OpenRouter</option></select>`;
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({ wildcards: ["item1", "item2"] })
                    }
                }]
            };
            return window.Api._parseResponse(mockResponse);
        });
        expect(result).toEqual(["item1", "item2"]);
    });

    test('should parse OpenRouter response correctly (Markdown code block)', async ({ page }) => {
        const result = await page.evaluate(() => {
            document.body.innerHTML = `<select id="api-endpoint"><option value="openrouter" selected>OpenRouter</option></select>`;
            const mockResponse = {
                choices: [{
                    message: {
                        content: "Here is the JSON:\n```json\n[\"itemA\", \"itemB\"]\n```"
                    }
                }]
            };
            return window.Api._parseResponse(mockResponse);
        });
        expect(result).toEqual(["itemA", "itemB"]);
    });

    // --- New Tests for testConnection ---

    test('should handle API errors gracefully during connection test', async ({ page }) => {
        await page.evaluate(async () => {
            const originalFetch = window.fetch;
            window.fetch = async () => {
                return {
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    text: async () => 'Invalid API Key'
                };
            };

            document.body.innerHTML = `<select id="api-endpoint"><option value="openrouter" selected>OpenRouter</option></select>
                <input id="openrouter-api-key" value="bad-key">`;

            try {
                await window.Api.testConnection('openrouter');
                throw new Error('Should have failed');
            } catch (e) {
                if (!e.message.includes('Request failed: 401')) throw new Error('Wrong error message: ' + e.message);
            } finally {
                window.fetch = originalFetch;
            }
        });
    });

    test('should test connection successfully for Gemini', async ({ page }) => {
        await page.evaluate(async () => {
            const originalFetch = window.fetch;
            window.fetch = async (url) => {
                if (url.includes('generativelanguage.googleapis.com') && url.includes('key=valid-key')) {
                    return {
                        ok: true,
                        json: async () => ({ models: [{ name: 'gemini-1.5-flash' }] })
                    };
                }
                return { ok: false, status: 400 };
            };

            document.body.innerHTML = `
                <input id="gemini-api-key" value="valid-key">
            `;

            try {
                const models = await window.Api.testConnection('gemini');
                if (models.length !== 1 || models[0].name !== 'gemini-1.5-flash') throw new Error('Failed to parse models');
            } finally {
                window.fetch = originalFetch;
            }
        });
    });

    test('should test connection successfully for OpenRouter', async ({ page }) => {
        await page.evaluate(async () => {
            const originalFetch = window.fetch;
            window.fetch = async (url) => {
                if (url === 'https://openrouter.ai/api/v1/models') {
                    return {
                        ok: true,
                        json: async () => ({ data: [{ id: 'openai/gpt-4' }] })
                    };
                }
                return { ok: false, status: 400 };
            };

            try {
                const models = await window.Api.testConnection('openrouter');
                if (models.length !== 1 || models[0].id !== 'openai/gpt-4') throw new Error('Failed to parse models');
            } finally {
                window.fetch = originalFetch;
            }
        });
    });

    test('should test connection successfully for Custom API', async ({ page }) => {
        await page.evaluate(async () => {
            const originalFetch = window.fetch;
            window.fetch = async (url, options) => {
                if (url === 'http://localhost:1234/models' && options.headers['Authorization'] === 'Bearer custom-key') {
                    return {
                        ok: true,
                        json: async () => ({ data: [{ id: 'local-model' }] })
                    };
                }
                return { ok: false, status: 400 };
            };

            document.body.innerHTML = `
                <input id="custom-api-url" value="http://localhost:1234">
                <input id="custom-api-key" value="custom-key">
            `;

            try {
                const models = await window.Api.testConnection('custom');
                if (models.length !== 1 || models[0].id !== 'local-model') throw new Error('Failed to parse models');
            } finally {
                window.fetch = originalFetch;
            }
        });
    });

    test('should throw error if Gemini key is missing', async ({ page }) => {
        await page.evaluate(async () => {
            document.body.innerHTML = `<input id="gemini-api-key" value="">`;
            try {
                await window.Api.testConnection('gemini');
                throw new Error('Should have failed');
            } catch (e) {
                if (e.message !== 'Gemini API key not provided.') throw new Error('Wrong error: ' + e.message);
            }
        });
    });

    test('should throw error if Custom URL is missing', async ({ page }) => {
        await page.evaluate(async () => {
            document.body.innerHTML = `<input id="custom-api-url" value="">`;
            try {
                await window.Api.testConnection('custom');
                throw new Error('Should have failed');
            } catch (e) {
                if (e.message !== 'Custom API URL is not provided.') throw new Error('Wrong error: ' + e.message);
            }
        });
    });
});
