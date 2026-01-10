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

    test.describe('Settings Menu Data Actions', () => {
        // Helper to navigate to Data tab in settings
        const navigateToDataSettings = async (page) => {
            const settingsBtn = page.locator('#settings-btn');
            await expect(settingsBtn).toBeVisible();
            await settingsBtn.click();

            const modal = page.locator('#settings-dialog');
            await expect(modal).toBeVisible();

            const dataTab = page.locator('.settings-tab[data-tab="data"]');
            await dataTab.click();
            await expect(page.locator('#settings-tab-data')).toBeVisible();
        };

        test('reload default data shows confirmation dialog', async ({ page }) => {
            await navigateToDataSettings(page);

            // Click reload default data
            const reloadBtn = page.locator('#restore-defaults-btn');
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
            await navigateToDataSettings(page);

            // Click factory reset
            const factoryResetBtn = page.locator('#factory-reset-btn');
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

            // Ensure dialog closes
            await expect(dialog).toBeHidden();

            // Wait for toast confirmation
            await expect(page.locator('.toast')).toContainText('Created', { timeout: 3000 });
            await page.waitForTimeout(500);

            // Verify the category was created
            const customCategory = page.locator(`details[data-path="${testCategoryName.replace(/\s+/g, '_')}"]`);
            await expect(customCategory).toBeVisible();

            // Step 2: Navigate to Settings -> Data
            await navigateToDataSettings(page);

            // Step 3: Click "Restore Default Wildcards"
            const reloadBtn = page.locator('#restore-defaults-btn');
            await expect(reloadBtn).toBeVisible();
            await reloadBtn.click();

            // Step 4: Confirm the action
            // Confirmation dialog is separate from settings modal
            await expect(dialog).toBeVisible({ timeout: 3000 });
            await expect(dialog).toContainText('Reload default wildcard data');

            const confirmBtn = dialog.locator('#confirm-btn');
            await expect(confirmBtn).toBeVisible();
            await confirmBtn.click();

            // Step 5: Wait for success toast
            await expect(page.locator('.toast').filter({ hasText: 'Default data reloaded' })).toBeVisible({ timeout: 10000 });

            // Step 6: Close Settings Modal
            await page.evaluate(() => {
                const d = document.getElementById('settings-dialog');
                if (d) d.close();
            });
            await expect(page.locator('#settings-dialog')).toBeHidden();

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
            const overflowBtn = page.locator('#overflow-menu-btn');
            await overflowBtn.click();
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
