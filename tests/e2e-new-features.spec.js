// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('New UI Features', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    // Toolbar & Dropdown Tests
    test.describe('Toolbar Dropdown', () => {
        test('dropdown is hidden by default', async ({ page }) => {
            const dropdown = page.locator('#overflow-menu-dropdown');
            await expect(dropdown).toHaveClass(/hidden/);
        });

        test('clicking more actions toggles dropdown', async ({ page }) => {
            const btn = page.locator('#overflow-menu-btn');
            const dropdown = page.locator('#overflow-menu-dropdown');

            await btn.click();
            await expect(dropdown).not.toHaveClass(/hidden/);

            await btn.click();
            await expect(dropdown).toHaveClass(/hidden/);
        });

        test('clicking outside closes dropdown', async ({ page }) => {
            const btn = page.locator('#overflow-menu-btn');
            const dropdown = page.locator('#overflow-menu-dropdown');

            await btn.click();
            await expect(dropdown).not.toHaveClass(/hidden/);

            // Click on body (outside dropdown)
            await page.click('h1');
            await expect(dropdown).toHaveClass(/hidden/);
        });

        test('dropdown items are accessible and clickable', async ({ page }) => {
            const btn = page.locator('#overflow-menu-btn');
            await btn.click();

            const exportBtn = page.locator('#export-config');
            await expect(exportBtn).toBeVisible();
        });
    });

    // Batch Operations Visibility
    test.describe('Batch Operations Visibility', () => {
        test('batch bar is hidden by default', async ({ page }) => {
            const batchBar = page.locator('#batch-ops-bar');
            await expect(batchBar).toHaveClass(/hidden/);
        });

        test('selecting a category shows batch bar', async ({ page }) => {
            const checkbox = page.locator('.category-batch-checkbox').first();
            await checkbox.check();

            const batchBar = page.locator('#batch-ops-bar');
            await expect(batchBar).not.toHaveClass(/hidden/);
            await expect(batchBar).toBeVisible();
        });

        test('deselecting all categories hides batch bar', async ({ page }) => {
            const checkbox = page.locator('.category-batch-checkbox').first();

            await checkbox.check();
            const batchBar = page.locator('#batch-ops-bar');
            await expect(batchBar).toBeVisible();

            await checkbox.uncheck();
            await expect(batchBar).toHaveClass(/hidden/);
        });
    });

    // Unified API Settings
    test.describe('Unified API Settings', () => {
        test('settings dialog opens and shows default provider', async ({ page }) => {
            const settingsBtn = page.locator('button[title="Global Settings"]');
            await settingsBtn.click();

            const dialog = page.locator('#settings-dialog');
            await expect(dialog).toBeVisible();

            // Default should be OpenRouter
            await expect(page.locator('#settings-openrouter')).toBeVisible();
        });

        test('switching provider in dropdown updates visible panel', async ({ page }) => {
            const settingsBtn = page.locator('button[title="Global Settings"]');
            await settingsBtn.click();

            const endpointSelect = page.locator('#api-endpoint');
            await endpointSelect.selectOption('gemini');

            await expect(page.locator('#settings-gemini')).toBeVisible();
            await expect(page.locator('#settings-openrouter')).toHaveClass(/hidden/);

            await endpointSelect.selectOption('custom');
            await expect(page.locator('#settings-custom')).toBeVisible();
        });
    });

    // Theme Toggle
    test.describe('Theme Toggle', () => {
        test('theme toggle updates icon path', async ({ page }) => {
            const toggleBtn = page.locator('#theme-toggle');
            const svgPath = toggleBtn.locator('path');

            // Get initial path d attribute
            const initialD = await svgPath.getAttribute('d');

            await toggleBtn.click();
            await page.waitForTimeout(200);

            const newD = await svgPath.getAttribute('d');
            expect(newD).not.toBe(initialD);
        });
    });

});
