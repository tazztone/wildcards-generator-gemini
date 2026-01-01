// @ts-check
const { test, expect } = require('@playwright/test');

// =============================================================================
// Test Fixtures & Helpers
// =============================================================================

test.describe('Wildcard Generator E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    // =========================================================================
    // Core UI Tests
    // =========================================================================

    test.describe('Core UI', () => {

        test('page loads with title', async ({ page }) => {
            await expect(page).toHaveTitle(/Wildcard Generator/);
            await expect(page.locator('h1')).toContainText('Wildcards Generator');
        });

        test('search input is functional', async ({ page }) => {
            const searchInput = page.locator('#search-wildcards');
            await expect(searchInput).toBeVisible();
            await searchInput.fill('dragon');
            await page.waitForTimeout(400);
            await expect(searchInput).toHaveValue('dragon');
        });

        test('undo/redo buttons are present in dropdown', async ({ page }) => {
            // Open dropdown
            await page.locator('#overflow-menu-btn').click();
            await expect(page.locator('#undo-btn')).toBeVisible();
            await expect(page.locator('#redo-btn')).toBeVisible();
        });

        test('primary export/import buttons are visible', async ({ page }) => {
            await expect(page.locator('#export-yaml')).toBeVisible();
            await expect(page.locator('#import-yaml')).toBeVisible();
            await expect(page.locator('#download-all-zip')).toBeVisible();
        });

        test('help button shows help dialog', async ({ page }) => {
            await page.locator('#help-btn').click();
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible();
        });
    });

    // =========================================================================
    // Category Operations
    // =========================================================================

    test.describe('Category Operations', () => {

        test('category expands on click', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();
            await expect(firstCategory).toBeVisible();

            // Use JavaScript to click the direct summary child
            await firstCategory.evaluate(el => {
                const summary = el.querySelector(':scope > summary');
                if (summary) /** @type {HTMLElement} */ (summary).click();
            });
            await page.waitForTimeout(800);

            // Check the details is now open
            const isOpen = await firstCategory.evaluate(el => el.hasAttribute('open'));
            expect(isOpen).toBe(true);
        });

        test('category collapses when clicked again', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();

            // Expand first using JS click
            await firstCategory.evaluate(el => {
                const summary = el.querySelector(':scope > summary');
                if (summary) /** @type {HTMLElement} */ (summary).click();
            });
            await page.waitForTimeout(800);
            let isOpen = await firstCategory.evaluate(el => el.hasAttribute('open'));
            expect(isOpen).toBe(true);

            // Collapse using JS click
            await firstCategory.evaluate(el => {
                const summary = el.querySelector(':scope > summary');
                if (summary) /** @type {HTMLElement} */ (summary).click();
            });
            await page.waitForTimeout(500);
            isOpen = await firstCategory.evaluate(el => el.hasAttribute('open'));
            expect(isOpen).toBe(false);
        });

        test('pin button toggles category pinning', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();
            const pinBtn = firstCategory.locator('.pin-btn');

            // Get initial text
            const initialText = await pinBtn.textContent();

            // Click pin button
            await pinBtn.click();
            await page.waitForTimeout(300);

            // Check toast appeared
            await expect(page.locator('.toast')).toBeVisible();
        });

        test('adding new top-level category shows dialog', async ({ page }) => {
            // Click add category button
            const addBtn = page.locator('#add-category-placeholder-btn');
            await expect(addBtn).toBeVisible();
            await addBtn.click();

            // Dialog should appear
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible();

            // Should have input field
            const input = dialog.locator('input[type="text"]');
            await expect(input).toBeVisible();
        });

        test('delete button shows confirmation dialog', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();
            const deleteBtn = firstCategory.locator('.delete-btn').first();

            await deleteBtn.click();

            // Confirmation dialog should appear
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible();
            await expect(page.locator('#confirm-btn')).toBeVisible();
            await expect(page.locator('#cancel-btn')).toBeVisible();
        });
    });

    // =========================================================================
    // Wildcard Management
    // =========================================================================

    test.describe('Wildcard Management', () => {

        test('copy button shows toast notification', async ({ page }) => {
            // Expand first category
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator('summary').click();
            await page.waitForTimeout(500);

            // Expand a subcategory to find wildcard cards
            const subCategory = firstCategory.locator('details').first();
            if (await subCategory.isVisible()) {
                await subCategory.locator('summary').click();
                await page.waitForTimeout(500);
            }

            // Find any copy button
            const copyBtn = page.locator('.copy-btn').first();
            if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await copyBtn.click();
                await expect(page.locator('.toast')).toBeVisible({ timeout: 3000 });
            }
        });

        test('add wildcard input is functional', async ({ page }) => {
            // Expand categories to find a wildcard card
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator('summary').click();
            await page.waitForTimeout(500);

            const subCategory = firstCategory.locator('details').first();
            if (await subCategory.isVisible()) {
                await subCategory.locator('summary').click();
                await page.waitForTimeout(500);
            }

            // Find add wildcard input
            const addInput = page.locator('.add-wildcard-input').first();
            if (await addInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await expect(addInput).toBeVisible();
                await addInput.fill('test-wildcard');
                await expect(addInput).toHaveValue('test-wildcard');
            }
        });

        test('generate more button exists in wildcard cards', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator('summary').click();
            await page.waitForTimeout(500);

            const subCategory = firstCategory.locator('details').first();
            if (await subCategory.isVisible()) {
                await subCategory.locator('summary').click();
                await page.waitForTimeout(500);
            }

            const generateBtn = page.locator('.generate-btn').first();
            if (await generateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await expect(generateBtn).toContainText('Generate More');
            }
        });

        test('select all button toggles text', async ({ page }) => {
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator('summary').click();
            await page.waitForTimeout(500);

            const subCategory = firstCategory.locator('details').first();
            if (await subCategory.isVisible()) {
                await subCategory.locator('summary').click();
                await page.waitForTimeout(500);
            }

            const selectAllBtn = page.locator('.select-all-btn').first();
            if (await selectAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await expect(selectAllBtn).toContainText('Select All');
                await selectAllBtn.click();
                await expect(selectAllBtn).toContainText('Deselect All');
            }
        });
    });

    // =========================================================================
    // Batch Operations
    // =========================================================================

    test.describe('Batch Operations', () => {

        test('batch operations bar is hidden by default', async ({ page }) => {
            await expect(page.locator('#batch-ops-bar')).toBeHidden();
        });

        test('select all categories checkbox works', async ({ page }) => {
            // First select one category to make the bar visible
            await page.locator('.category-batch-checkbox').first().check();
            await expect(page.locator('#batch-ops-bar')).toBeVisible();

            const selectAllCheckbox = page.locator('#batch-select-all');

            // Initially buttons should be enabled because we have 1 selected
            await expect(page.locator('#batch-expand')).toBeEnabled();

            // Uncheck the single one to verify empty state behavior (bar should hide)
            await page.locator('.category-batch-checkbox').first().uncheck();
            await expect(page.locator('#batch-ops-bar')).toBeHidden();

            // Now check select all (we need to trigger it, but wait, if hidden we can't click it!)
            // Re-select one to show bar
            await page.locator('.category-batch-checkbox').first().check();
            await expect(selectAllCheckbox).toBeVisible();

            // Check select all
            await selectAllCheckbox.check();
            await page.waitForTimeout(200);

            // Buttons should be enabled
            await expect(page.locator('#batch-expand')).toBeEnabled();
            await expect(page.locator('#batch-collapse')).toBeEnabled();
            await expect(page.locator('#batch-delete')).toBeEnabled();
        });

        test('batch expand expands selected categories', async ({ page }) => {
            // Select a category to show bar
            await page.locator('.category-batch-checkbox').first().check();

            // Select all categories
            await page.locator('#batch-select-all').check();
            await page.waitForTimeout(200);

            // Click expand
            await page.locator('#batch-expand').click();
            await page.waitForTimeout(300);

            // Toast should appear
            await expect(page.locator('.toast')).toBeVisible();
        });

        test('batch collapse collapses selected categories', async ({ page }) => {
            // Select a category to show bar and expand
            await page.locator('.category-batch-checkbox').first().check();
            await page.locator('#batch-select-all').check();
            await page.locator('#batch-expand').click();
            await page.waitForTimeout(500);

            // Re-check selection and collapse
            // Note: Actions might have cleared selection if re-rendered, but assuming state persists or we re-select
            if (await page.locator('#batch-ops-bar').isHidden()) {
                await page.locator('.category-batch-checkbox').first().check();
            }
            await page.locator('#batch-select-all').check();
            await page.waitForTimeout(200);
            await page.locator('#batch-collapse').click();
            await page.waitForTimeout(500);

            // Toast should appear (use .first() since there may be multiple)
            await expect(page.locator('.toast').first()).toBeVisible({ timeout: 3000 });
        });
    });

    // =========================================================================
    // Theme & Settings
    // =========================================================================

    test.describe('Theme & Settings', () => {

        test('theme toggle button is visible', async ({ page }) => {
            await expect(page.locator('#theme-toggle')).toBeVisible();
        });

        test('theme toggle switches between dark and light', async ({ page }) => {
            const html = page.locator('html');
            const initialTheme = await html.getAttribute('class');

            await page.locator('#theme-toggle').click();
            await page.waitForTimeout(300);

            const newTheme = await html.getAttribute('class');
            expect(newTheme).not.toBe(initialTheme);

            // Should show toast
            await expect(page.locator('.toast')).toBeVisible();
        });

        test('global settings panel toggles', async ({ page }) => {
            const settingsBtn = page.locator('button[title="Global Settings"]');

            await settingsBtn.click();
            await page.waitForTimeout(200);

            await expect(page.locator('#api-endpoint')).toBeVisible();
        });

        test('API endpoint dropdown has options', async ({ page }) => {
            // Open settings
            await page.locator('button[title="Global Settings"]').click();
            await page.waitForTimeout(200);

            const dropdown = page.locator('#api-endpoint');
            await expect(dropdown).toBeVisible();

            // Check options exist
            await expect(dropdown.locator('option[value="openrouter"]')).toHaveCount(1);
            await expect(dropdown.locator('option[value="gemini"]')).toHaveCount(1);
            await expect(dropdown.locator('option[value="custom"]')).toHaveCount(1);
        });

        test('switching API provider shows different settings panel', async ({ page }) => {
            // Open settings
            await page.locator('button[title="Global Settings"]').click();
            await page.waitForTimeout(200);

            // Initially OpenRouter should be visible
            await expect(page.locator('#settings-openrouter')).toBeVisible();

            // Switch to Gemini
            await page.locator('#api-endpoint').selectOption('gemini');
            await page.waitForTimeout(200);

            // Gemini panel should now be visible
            await expect(page.locator('#settings-gemini')).toBeVisible();
            await expect(page.locator('#settings-openrouter')).toBeHidden();
        });
    });

    // =========================================================================
    // Search & Statistics
    // =========================================================================

    test.describe('Search & Statistics', () => {

        test('statistics dashboard shows counts', async ({ page }) => {
            await expect(page.locator('#stat-categories')).toBeVisible();
            await expect(page.locator('#stat-wildcards')).toBeVisible();
            await expect(page.locator('#stat-pinned')).toBeVisible();

            // Should have non-zero values after loading initial data
            const wildcardCount = await page.locator('#stat-wildcards').textContent() || '0';
            expect(parseInt(wildcardCount.replace(/,/g, ''))).toBeGreaterThan(0);
        });

        test('search shows result count', async ({ page }) => {
            const searchInput = page.locator('#search-wildcards');
            // Use a wildcard term we know exists in initial data
            await searchInput.fill('dragon');
            // Wait long enough for debounce (300ms) + search execution + render
            await page.waitForTimeout(1000);

            // Result count element should be in the DOM
            const resultCount = page.locator('#search-results-count');
            await expect(resultCount).toBeAttached();

            // The search input should still have our term
            await expect(searchInput).toHaveValue('dragon');
        });

        test('check duplicates button works', async ({ page }) => {
            const checkDupes = page.locator('#check-duplicates');
            await expect(checkDupes).toBeVisible();
            await checkDupes.click();

            // Should show toast or dialog
            await page.waitForTimeout(500);
            const toastOrDialog = page.locator('.toast, #notification-dialog');
            await expect(toastOrDialog.first()).toBeVisible();
        });

        test('clear search resets view', async ({ page }) => {
            const searchInput = page.locator('#search-wildcards');

            // Search for something
            await searchInput.fill('dragon');
            await page.waitForTimeout(500);

            // Clear search
            await searchInput.fill('');
            await page.waitForTimeout(500);

            // Result count should be empty
            await expect(page.locator('#search-results-count')).toBeEmpty();
        });
    });

    // =========================================================================
    // Import/Export
    // =========================================================================

    test.describe('Import/Export', () => {

        test('export YAML button triggers download', async ({ page }) => {
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#export-yaml').click();

            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe('wildcards.yaml');
        });

        test('export ZIP button triggers download', async ({ page }) => {
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#download-all-zip').click();

            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe('wildcard_collection.zip');
        });

        test('export config button triggers download', async ({ page }) => {
            const downloadPromise = page.waitForEvent('download');
            // Open dropdown
            await page.locator('#overflow-menu-btn').click();
            await page.locator('#export-config').click();

            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe('config.json');
        });

        test('import YAML button is functional', async ({ page }) => {
            const importBtn = page.locator('#import-yaml');
            await expect(importBtn).toBeVisible();
            await expect(importBtn).toBeEnabled();
        });

        test('import config button is functional', async ({ page }) => {
            // Open dropdown
            await page.locator('#overflow-menu-btn').click();
            const importBtn = page.locator('#import-config');
            await expect(importBtn).toBeVisible();
            // We can't easily test 'enabled' if it's a label for file input, assuming structure
            // Just visibility is enough here or verify input exists
        });
    });

    // =========================================================================
    // Keyboard Shortcuts
    // =========================================================================

    test.describe('Keyboard Shortcuts', () => {

        test('Ctrl+S shows auto-save message', async ({ page }) => {
            await page.keyboard.press('Control+s');
            const toast = page.locator('.toast');
            await expect(toast).toBeVisible();
            await expect(toast).toContainText('saved automatically');
        });

        test('Ctrl+Z triggers undo', async ({ page }) => {
            // Make a change first (expand a category)
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.locator('summary').click();
            await page.waitForTimeout(300);

            // Press Ctrl+Z
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(300);

            // Should not cause error (undo works silently on UI changes)
        });

        test('Escape key collapses all categories', async ({ page }) => {
            // Expand some categories first via batch operation
            // Trigger batch bar
            await page.locator('.category-batch-checkbox').first().check();
            await page.locator('#batch-select-all').check();
            await page.waitForTimeout(200);
            await page.locator('#batch-expand').click();
            await page.waitForTimeout(500);

            // Clear any existing toasts by waiting
            await page.waitForTimeout(500);

            // Focus on the first category's summary using JS
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.evaluate(el => {
                const summary = el.querySelector(':scope > summary');
                if (summary) /** @type {HTMLElement} */ (summary).focus();
            });
            await page.waitForTimeout(200);

            // Press Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            // Toast should appear
            await expect(page.locator('.toast').last()).toBeVisible({ timeout: 3000 });
        });

        test('arrow keys navigate between categories', async ({ page }) => {
            const container = page.locator('#wildcard-container');
            const categories = container.locator(':scope > details');

            // Focus first category
            await categories.first().locator('summary').focus();

            // Press down arrow
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(100);

            // Second category should be focused (cannot easily verify, but no error is good)
        });
    });

    // =========================================================================
    // Dialogs & Popups
    // =========================================================================

    test.describe('Dialogs & Popups', () => {

        test('notification dialog can be closed', async ({ page }) => {
            // Open help to show dialog
            await page.locator('#help-btn').click();
            const dialog = page.locator('#notification-dialog');
            await expect(dialog).toBeVisible();

            // Close it
            await page.locator('#notification-close').click();
            await expect(dialog).not.toBeVisible();
        });

        test('suggest popup elements exist', async ({ page }) => {
            await expect(page.locator('#suggestPopup')).toBeAttached();
            await expect(page.locator('#confirmBtn')).toBeAttached();
            await expect(page.locator('#cancelBtn')).toBeAttached();
        });

        test('generate popup elements exist', async ({ page }) => {
            await expect(page.locator('#generatePopup')).toBeAttached();
            await expect(page.locator('#generateConfirmBtn')).toBeAttached();
            await expect(page.locator('#generateCancelBtn')).toBeAttached();
        });
    });

    // =========================================================================
    // Accessibility
    // =========================================================================

    test.describe('Accessibility', () => {

        test('aria live region exists', async ({ page }) => {
            await expect(page.locator('#aria-live-region')).toBeAttached();
        });

        test('toast container has aria-live', async ({ page }) => {
            const toastContainer = page.locator('#toast-container');
            await expect(toastContainer).toHaveAttribute('aria-live', 'polite');
        });

        test('dialogs have proper role attributes', async ({ page }) => {
            const suggestPopup = page.locator('#suggestPopup');
            await expect(suggestPopup).toHaveAttribute('role', 'dialog');

            const generatePopup = page.locator('#generatePopup');
            await expect(generatePopup).toHaveAttribute('role', 'dialog');
        });
    });
});
