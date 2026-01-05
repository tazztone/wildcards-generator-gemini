// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Bug Fix Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test.describe('Add Category', () => {
        test('should add new top-level category via + button', async ({ page }) => {
            // Scroll to bottom where add category button is
            const addBtn = page.locator('#add-category-placeholder-btn');
            await addBtn.scrollIntoViewIfNeeded();
            await expect(addBtn).toBeVisible({ timeout: 5000 });

            // Click it
            await addBtn.click();

            // Wait for dialog
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible({ timeout: 5000 });

            // Enter a unique name
            const testName = `TestCategory${Date.now()}`;
            const input = dialog.locator('input[type="text"]');
            await expect(input).toBeVisible();
            await input.fill(testName);

            // Click confirm
            await dialog.locator('#confirm-btn').click();

            // Verify toast shows success
            await expect(page.locator('.toast')).toContainText('Created', { timeout: 5000 });
        });

        test('should add new subcategory via + button', async ({ page }) => {
            // Expand first category
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator(':scope > summary').click();
            await page.waitForTimeout(500);

            // Find add subcategory button
            const addSubcatBtn = firstCategory.locator('.add-subcategory-btn').first();
            if (await addSubcatBtn.isVisible()) {
                await addSubcatBtn.click();

                // Wait for dialog
                const dialog = page.locator('#notification-dialog');
                await expect(dialog).toBeVisible({ timeout: 3000 });

                // Enter name
                const testName = `SubTest${Date.now()}`;
                const input = dialog.locator('input[type="text"]');
                await input.fill(testName);

                // Confirm
                await dialog.locator('#confirm-btn').click();

                // Verify toast
                await expect(page.locator('.toast')).toContainText('Created');
            }
        });
    });

    test.describe('Overflow Menu Actions', () => {
        test('reload default data shows confirmation dialog', async ({ page }) => {
            // Open overflow menu
            const overflowBtn = page.locator('#overflow-menu-btn');
            await expect(overflowBtn).toBeVisible();
            await overflowBtn.click();

            // Wait for dropdown to be visible
            const dropdown = page.locator('#overflow-menu-dropdown');
            await expect(dropdown).toBeVisible({ timeout: 3000 });

            // Click reload default data
            const reloadBtn = page.locator('#reload-default-data');
            await expect(reloadBtn).toBeVisible();
            await reloadBtn.click();

            // Verify confirmation dialog appears
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible({ timeout: 3000 });
            await expect(dialog).toContainText('Reload default wildcard data');

            // Cancel to avoid reload
            await dialog.locator('#cancel-btn').click();
        });

        test('factory reset shows confirmation dialog', async ({ page }) => {
            // Open overflow menu
            const overflowBtn = page.locator('#overflow-menu-btn');
            await expect(overflowBtn).toBeVisible();
            await overflowBtn.click();

            // Wait for dropdown
            const dropdown = page.locator('#overflow-menu-dropdown');
            await expect(dropdown).toBeVisible({ timeout: 3000 });

            // Click factory reset
            const factoryResetBtn = page.locator('#factory-reset');
            await expect(factoryResetBtn).toBeVisible();
            await factoryResetBtn.click();

            // Verify confirmation dialog appears
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible({ timeout: 3000 });
            await expect(dialog).toContainText('Factory Reset');

            // Cancel to avoid reset
            await dialog.locator('#cancel-btn').click();
        });

        test('restore default wildcards removes manually added categories', async ({ page }) => {
            // Track console errors
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            // Step 1: Add a custom category
            const addBtn = page.locator('#add-category-placeholder-btn');
            await addBtn.scrollIntoViewIfNeeded();
            await addBtn.click();

            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible({ timeout: 3000 });

            const testCategoryName = `TestCategory_${Date.now()}`;
            const input = dialog.locator('input[type="text"]');
            await input.fill(testCategoryName);
            await dialog.locator('#confirm-btn').click();

            // Wait for toast confirmation
            await expect(page.locator('.toast')).toContainText('Created', { timeout: 3000 });
            await page.waitForTimeout(500);

            // Verify the category was created
            const customCategory = page.locator(`details[data-path="${testCategoryName.replace(/\s+/g, '_')}"]`);
            await expect(customCategory).toBeVisible();

            // Step 2: Open overflow menu
            const overflowBtn = page.locator('#overflow-menu-btn');
            await overflowBtn.click();

            // Wait for dropdown
            const dropdown = page.locator('#overflow-menu-dropdown');
            await expect(dropdown).toBeVisible({ timeout: 3000 });

            // Step 3: Click "Restore Default Wildcards"
            const reloadBtn = page.locator('#reload-default-data');
            await expect(reloadBtn).toBeVisible();
            await reloadBtn.click();

            // Step 4: Confirm the action
            await expect(dialog).toBeVisible({ timeout: 3000 });
            await expect(dialog).toContainText('Reload default wildcard data');

            const confirmBtn = dialog.locator('#confirm-btn');
            await expect(confirmBtn).toBeVisible();
            await confirmBtn.click();

            // Step 5: Wait for success toast
            await expect(page.locator('.toast').last()).toContainText('Default data reloaded', { timeout: 5000 });

            // Step 6: Verify the overflow menu is closed
            await expect(dropdown).toBeHidden();

            // Step 7: Verify the manually added category is gone
            await page.waitForTimeout(500);
            await expect(customCategory).not.toBeVisible();

            // Step 8: Verify default categories are present
            const container = page.locator('#wildcard-container');
            await expect(container.locator('details')).not.toHaveCount(0);

            // Step 9: Verify no console errors occurred
            expect(errors.filter(e => !e.includes('Download the Vue Devtools'))).toHaveLength(0);
        });
    });

    test.describe('Import YAML', () => {
        test('import button is visible and clickable', async ({ page }) => {
            const importBtn = page.locator('#import-yaml');
            await expect(importBtn).toBeVisible();
            // Can't test file picker in automation, just verify button exists
        });
    });

    test.describe('LocalStorage Quota Handling', () => {
        test('should handle edits without quota errors', async ({ page }) => {
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error' && msg.text().includes('quota')) {
                    errors.push(msg.text());
                }
            });

            // Make some edits
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator(':scope > summary').click();
            await page.waitForTimeout(300);

            const input = firstCategory.locator('.custom-instructions-input').first();
            if (await input.isVisible()) {
                await input.dblclick();
                await page.waitForTimeout(200);
                await input.fill('Test instruction');
                await input.press('Enter');
            }

            expect(errors.length).toBe(0);
        });
    });
});
