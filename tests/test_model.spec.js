// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Test Model Feature', () => {

    test.beforeEach(async ({ page }) => {
        // Disable first-run help dialog
        await page.addInitScript(() => {
            window.localStorage.setItem('wildcards-visited', 'true');
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test.describe('Test Connection Button', () => {
        test('test connection button is visible in each provider panel', async ({ page }) => {
            await page.locator('#settings-btn').click();
            await expect(page.locator('#settings-dialog')).toBeVisible();

            // OpenRouter panel (default)
            const orTestBtn = page.locator('#settings-openrouter .test-conn-btn');
            await expect(orTestBtn).toBeVisible();

            // Gemini panel
            await page.locator('#api-endpoint').selectOption('gemini');
            const geminiTestBtn = page.locator('#settings-gemini .test-conn-btn');
            await expect(geminiTestBtn).toBeVisible();

            // Custom panel
            await page.locator('#api-endpoint').selectOption('custom');
            const customTestBtn = page.locator('#settings-custom .test-conn-btn');
            await expect(customTestBtn).toBeVisible();
        });
    });

    test.describe('Model List', () => {
        test('model list dropdown/select exists', async ({ page }) => {
            await page.locator('#settings-btn').click();
            await expect(page.locator('#settings-dialog')).toBeVisible();

            // Model input/select should exist
            const modelInput = page.locator('#openrouter-model-name');
            await expect(modelInput).toBeVisible();
        });

        test('model name input is editable', async ({ page }) => {
            await page.locator('#settings-btn').click();

            const modelInput = page.locator('#openrouter-model-name');
            await modelInput.fill('my-custom-model');
            await expect(modelInput).toHaveValue('my-custom-model');
        });
    });

    test.describe('API Key Input', () => {
        test('API key input exists for each provider', async ({ page }) => {
            await page.locator('#settings-btn').click();

            // OpenRouter
            await expect(page.locator('#openrouter-api-key')).toBeVisible();

            // Gemini
            await page.locator('#api-endpoint').selectOption('gemini');
            await expect(page.locator('#gemini-api-key')).toBeVisible();

            // Custom
            await page.locator('#api-endpoint').selectOption('custom');
            await expect(page.locator('#custom-api-key')).toBeVisible();
        });
    });
});
