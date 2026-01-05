// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Settings Persistence', () => {

    test.beforeEach(async ({ page }) => {
        // Clear localStorage before each test
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await page.waitForLoadState('networkidle');
    });

    test.describe('Model Name Persistence', () => {
        test('model name persists after page reload', async ({ page }) => {
            // Open settings
            await page.locator('button[title="Global Settings"]').click();
            await expect(page.locator('#settings-dialog')).toBeVisible();

            // Change model name for OpenRouter
            const modelInput = page.locator('#openrouter-model-name');
            await modelInput.fill('test-model-name');
            await modelInput.blur();

            // Close settings and reload
            await page.locator('#settings-close-btn').click();
            await page.reload();
            await page.waitForLoadState('networkidle');

            // Reopen settings and verify
            await page.locator('button[title="Global Settings"]').click();
            await expect(page.locator('#openrouter-model-name')).toHaveValue('test-model-name');
        });

        test('each provider model name persists independently', async ({ page }) => {
            await page.locator('button[title="Global Settings"]').click();

            // Set OpenRouter model
            await page.locator('#openrouter-model-name').fill('openrouter-test');
            await page.locator('#openrouter-model-name').blur();

            // Switch to Gemini and set model
            await page.locator('#api-endpoint').selectOption('gemini');
            await page.locator('#gemini-model-name').fill('gemini-test');
            await page.locator('#gemini-model-name').blur();

            // Close and reload
            await page.locator('#settings-close-btn').click();
            await page.reload();
            await page.waitForLoadState('networkidle');

            // Verify both persisted
            await page.locator('button[title="Global Settings"]').click();
            await expect(page.locator('#openrouter-model-name')).toHaveValue('openrouter-test');

            await page.locator('#api-endpoint').selectOption('gemini');
            await expect(page.locator('#gemini-model-name')).toHaveValue('gemini-test');
        });
    });

    test.describe('API Provider Persistence', () => {
        test('active provider persists after reload', async ({ page }) => {
            // Open settings and switch provider
            await page.locator('button[title="Global Settings"]').click();
            await page.locator('#api-endpoint').selectOption('gemini');
            await expect(page.locator('#settings-gemini')).toBeVisible();

            // Close and reload
            await page.locator('#settings-close-btn').click();
            await page.reload();
            await page.waitForLoadState('networkidle');

            // Verify Gemini is still selected
            await page.locator('button[title="Global Settings"]').click();
            await expect(page.locator('#api-endpoint')).toHaveValue('gemini');
            await expect(page.locator('#settings-gemini')).toBeVisible();
        });
    });

    test.describe('Prompt Visibility', () => {
        test('global prompt textarea exists in settings', async ({ page }) => {
            await page.locator('button[title="Global Settings"]').click();
            await expect(page.locator('#settings-dialog')).toBeVisible();

            // Check for prompt textarea - exact ID may vary
            const promptTextarea = page.locator('#global-prompt, #suggestion-prompt, textarea').first();
            await expect(promptTextarea).toBeAttached();
        });
    });
});
