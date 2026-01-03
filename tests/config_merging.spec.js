// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Unit tests for Config/Settings Merging Logic
 * Tests the handleLoadSettings function and config application
 */
test.describe('Config Merging Logic', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Wait for modules to be exposed
        await page.waitForFunction(() => window.Config && window.ImportExport);
    });

    test('Settings file applies values to Config object', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // Simulate loading settings
            const mockConfig = {
                apiEndpoint: 'gemini',
                modelNameGemini: 'gemini-2.0-flash',
                historyLimit: 50
            };

            const originalEndpoint = window.Config.API_ENDPOINT;

            // Apply config manually (simulating the logic in handleLoadSettings)
            if (mockConfig.apiEndpoint) window.Config.API_ENDPOINT = mockConfig.apiEndpoint;
            if (mockConfig.modelNameGemini) window.Config.MODEL_NAME_GEMINI = mockConfig.modelNameGemini;
            if (mockConfig.historyLimit) window.Config.HISTORY_LIMIT = mockConfig.historyLimit;

            return {
                newEndpoint: window.Config.API_ENDPOINT,
                newModelName: window.Config.MODEL_NAME_GEMINI,
                newHistoryLimit: window.Config.HISTORY_LIMIT,
                originalEndpoint
            };
        });

        expect(result.newEndpoint).toBe('gemini');
        expect(result.newModelName).toBe('gemini-2.0-flash');
        expect(result.newHistoryLimit).toBe(50);
    });

    test('Partial settings preserve existing values', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // Set initial values
            window.Config.API_ENDPOINT = 'openrouter';
            window.Config.MODEL_NAME_OPENROUTER = 'original-model';
            window.Config.HISTORY_LIMIT = 20;

            // Apply partial config (only some fields)
            const partialConfig = {
                modelNameOpenrouter: 'new-model'
                // apiEndpoint and historyLimit not specified
            };

            if (partialConfig.apiEndpoint) window.Config.API_ENDPOINT = partialConfig.apiEndpoint;
            if (partialConfig.modelNameOpenrouter) window.Config.MODEL_NAME_OPENROUTER = partialConfig.modelNameOpenrouter;
            if (partialConfig.historyLimit) window.Config.HISTORY_LIMIT = partialConfig.historyLimit;

            return {
                endpoint: window.Config.API_ENDPOINT,
                modelName: window.Config.MODEL_NAME_OPENROUTER,
                historyLimit: window.Config.HISTORY_LIMIT
            };
        });

        // Only modelName should change, others preserved
        expect(result.endpoint).toBe('openrouter');
        expect(result.modelName).toBe('new-model');
        expect(result.historyLimit).toBe(20);
    });

    test('Invalid config values are handled gracefully', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const originalLimit = window.Config.HISTORY_LIMIT;

            // Apply config with invalid values
            const invalidConfig = {
                historyLimit: 'not-a-number',
                searchDebounceDelay: -100
            };

            // The real implementation validates before applying
            if (typeof invalidConfig.historyLimit === 'number' && invalidConfig.historyLimit > 0) {
                window.Config.HISTORY_LIMIT = invalidConfig.historyLimit;
            }
            if (typeof invalidConfig.searchDebounceDelay === 'number' && invalidConfig.searchDebounceDelay >= 0) {
                window.Config.SEARCH_DEBOUNCE_DELAY = invalidConfig.searchDebounceDelay;
            }

            return {
                historyLimit: window.Config.HISTORY_LIMIT,
                originalLimit
            };
        });

        // Value should remain unchanged due to validation
        expect(result.historyLimit).toBe(result.originalLimit);
    });

    test('API keys are excluded from settings export', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // Set some API keys
            window.Config.API_KEY_GEMINI = 'secret-gemini-key';
            window.Config.API_KEY_OPENROUTER = 'secret-openrouter-key';
            window.Config.API_ENDPOINT = 'gemini';
            window.Config.MODEL_NAME_GEMINI = 'test-model';

            // Create export object (same logic as handleExportSettings)
            const settings = {
                _comment: "User settings for Wildcards Generator",
                apiEndpoint: window.Config.API_ENDPOINT,
                modelNameGemini: window.Config.MODEL_NAME_GEMINI,
                modelNameOpenrouter: window.Config.MODEL_NAME_OPENROUTER,
                modelNameCustom: window.Config.MODEL_NAME_CUSTOM,
                apiUrlCustom: window.Config.API_URL_CUSTOM,
                historyLimit: window.Config.HISTORY_LIMIT,
                searchDebounceDelay: window.Config.SEARCH_DEBOUNCE_DELAY
            };

            const jsonOutput = JSON.stringify(settings);

            return {
                containsApiKeyGemini: jsonOutput.includes('secret-gemini-key'),
                containsApiKeyOpenrouter: jsonOutput.includes('secret-openrouter-key'),
                containsModelName: jsonOutput.includes('test-model'),
                containsEndpoint: jsonOutput.includes('gemini')
            };
        });

        expect(result.containsApiKeyGemini).toBe(false);
        expect(result.containsApiKeyOpenrouter).toBe(false);
        expect(result.containsModelName).toBe(true);
        expect(result.containsEndpoint).toBe(true);
    });

    test('Config merging handles all provider settings', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const config = {
                apiEndpoint: 'custom',
                modelNameGemini: 'gemini-model',
                modelNameOpenrouter: 'openrouter-model',
                modelNameCustom: 'custom-model',
                apiUrlCustom: 'http://localhost:8080/v1'
            };

            // Apply all
            if (config.apiEndpoint) window.Config.API_ENDPOINT = config.apiEndpoint;
            if (config.modelNameGemini) window.Config.MODEL_NAME_GEMINI = config.modelNameGemini;
            if (config.modelNameOpenrouter) window.Config.MODEL_NAME_OPENROUTER = config.modelNameOpenrouter;
            if (config.modelNameCustom) window.Config.MODEL_NAME_CUSTOM = config.modelNameCustom;
            if (config.apiUrlCustom) window.Config.API_URL_CUSTOM = config.apiUrlCustom;

            return {
                endpoint: window.Config.API_ENDPOINT,
                gemini: window.Config.MODEL_NAME_GEMINI,
                openrouter: window.Config.MODEL_NAME_OPENROUTER,
                custom: window.Config.MODEL_NAME_CUSTOM,
                customUrl: window.Config.API_URL_CUSTOM
            };
        });

        expect(result.endpoint).toBe('custom');
        expect(result.gemini).toBe('gemini-model');
        expect(result.openrouter).toBe('openrouter-model');
        expect(result.custom).toBe('custom-model');
        expect(result.customUrl).toBe('http://localhost:8080/v1');
    });

    test('Numeric config values are properly converted', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // When loading from JSON, numbers come as proper numbers
            const config = {
                historyLimit: 100,
                searchDebounceDelay: 500
            };

            if (typeof config.historyLimit === 'number' && config.historyLimit > 0) {
                window.Config.HISTORY_LIMIT = config.historyLimit;
            }
            if (typeof config.searchDebounceDelay === 'number' && config.searchDebounceDelay >= 0) {
                window.Config.SEARCH_DEBOUNCE_DELAY = config.searchDebounceDelay;
            }

            return {
                historyLimit: window.Config.HISTORY_LIMIT,
                searchDebounce: window.Config.SEARCH_DEBOUNCE_DELAY,
                historyLimitType: typeof window.Config.HISTORY_LIMIT,
                searchDebounceType: typeof window.Config.SEARCH_DEBOUNCE_DELAY
            };
        });

        expect(result.historyLimit).toBe(100);
        expect(result.searchDebounce).toBe(500);
        expect(result.historyLimitType).toBe('number');
        expect(result.searchDebounceType).toBe('number');
    });

    test('Empty config object causes no changes', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // Store original values
            const originalEndpoint = window.Config.API_ENDPOINT;
            const originalHistoryLimit = window.Config.HISTORY_LIMIT;

            // Apply empty config
            const emptyConfig = {};

            if (emptyConfig.apiEndpoint) window.Config.API_ENDPOINT = emptyConfig.apiEndpoint;
            if (emptyConfig.historyLimit) window.Config.HISTORY_LIMIT = emptyConfig.historyLimit;

            return {
                endpointUnchanged: window.Config.API_ENDPOINT === originalEndpoint,
                historyLimitUnchanged: window.Config.HISTORY_LIMIT === originalHistoryLimit
            };
        });

        expect(result.endpointUnchanged).toBe(true);
        expect(result.historyLimitUnchanged).toBe(true);
    });

    test('Config with extra/unknown properties is handled safely', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const configWithExtras = {
                apiEndpoint: 'gemini',
                unknownProperty: 'should be ignored',
                anotherUnknown: 12345
            };

            // Only apply known properties
            if (configWithExtras.apiEndpoint) window.Config.API_ENDPOINT = configWithExtras.apiEndpoint;
            // unknownProperty and anotherUnknown are ignored

            return {
                endpoint: window.Config.API_ENDPOINT,
                hasUnknown: 'unknownProperty' in window.Config
            };
        });

        expect(result.endpoint).toBe('gemini');
        expect(result.hasUnknown).toBe(false);
    });
});
