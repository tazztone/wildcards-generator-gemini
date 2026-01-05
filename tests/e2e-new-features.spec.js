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

            const exportBtn = page.locator('#undo-btn');
            await expect(exportBtn).toBeVisible();
        });
    });

});
