// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Template Architect Feature Tests
 * Tests the context-aware template generation in 0_TEMPLATES category
 */

test.describe('Template Architect', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('Generate button shows "Generate Templates" inside 0_TEMPLATES', async ({ page }) => {
        // Create 0_TEMPLATES category via State
        await page.evaluate(() => {
            window.State.saveStateToHistory();
            window.State.state.wildcards['0_TEMPLATES'] = {
                instruction: 'Templates category',
                Test_List: {
                    instruction: 'Test template list',
                    wildcards: []
                }
            };
        });

        // Wait for UI to update
        await page.waitForTimeout(500);

        // Open the 0_TEMPLATES category
        const templatesCategory = page.locator('details[data-path="0_TEMPLATES"]');
        await templatesCategory.click();
        await page.waitForTimeout(300);

        // Find the card inside 0_TEMPLATES
        const templateCard = page.locator('[data-path="0_TEMPLATES/Test_List"]');
        await expect(templateCard).toBeVisible();

        // Check button text
        const generateBtn = templateCard.locator('.generate-btn .btn-text');
        await expect(generateBtn).toHaveText('Generate Templates');
    });

    test('Regular categories show "Generate More" button', async ({ page }) => {
        // Open first regular category (skip 0_TEMPLATES)
        const firstCategory = page.locator('details[data-path^="1_"]').first();
        await firstCategory.locator('> summary').click();
        await page.waitForTimeout(300);

        // Open subcategory if present (traverse down to find leaf nodes)
        const subDetails = firstCategory.locator('details').first();
        if (await subDetails.count() > 0 && await subDetails.isVisible()) {
            await subDetails.locator('> summary').click();
            await page.waitForTimeout(300);
        }

        // Find any wildcard card inside the opened category
        const wildcardCard = firstCategory.locator('.wildcard-card').first();

        if (await wildcardCard.count() > 0) {
            const generateBtn = wildcardCard.locator('.generate-btn .btn-text');
            await expect(generateBtn).toHaveText('Generate More');
        }
    });

    test('Template sources dialog appears when clicking Generate Templates', async ({ page }) => {
        // Setup 0_TEMPLATES with a list
        await page.evaluate(() => {
            window.State.saveStateToHistory();
            window.State.state.wildcards['0_TEMPLATES'] = {
                instruction: '',
                Scene_Templates: { instruction: '', wildcards: [] }
            };
        });

        await page.waitForTimeout(500);

        // Open 0_TEMPLATES
        const templatesCategory = page.locator('details[data-path="0_TEMPLATES"]');
        await templatesCategory.click();

        // Click Generate Templates
        const generateBtn = page.locator('[data-path="0_TEMPLATES/Scene_Templates"] .generate-btn');
        await generateBtn.click();

        // Dialog should appear
        const dialog = page.locator('#notification-dialog');
        await expect(dialog).toBeVisible();

        // Check dialog content
        await expect(page.getByText('Select Template Sources')).toBeVisible();
        await expect(page.locator('#tpl-select-all')).toBeVisible();
        await expect(page.locator('#tpl-select-none')).toBeVisible();
    });

    test('Select All/None buttons toggle category checkboxes', async ({ page }) => {
        // Setup
        await page.evaluate(() => {
            window.State.saveStateToHistory();
            window.State.state.wildcards['0_TEMPLATES'] = {
                instruction: '',
                Test: { instruction: '', wildcards: [] }
            };
        });

        await page.waitForTimeout(500);

        const templatesCategory = page.locator('details[data-path="0_TEMPLATES"]');
        await templatesCategory.click();

        const generateBtn = page.locator('[data-path="0_TEMPLATES/Test"] .generate-btn');
        await generateBtn.click();

        // Wait for dialog
        await expect(page.getByText('Select Template Sources')).toBeVisible();

        // Click Select None
        await page.click('#tpl-select-none');

        // Check count shows 0
        const countEl = page.locator('#tpl-count');
        await expect(countEl).toHaveText('0');

        // Click Select All
        await page.click('#tpl-select-all');

        // Count should be > 0
        const count = await countEl.textContent();
        expect(parseInt(count || '0')).toBeGreaterThan(0);
    });

    test('Cancel button closes the dialog', async ({ page }) => {
        await page.evaluate(() => {
            window.State.state.wildcards['0_TEMPLATES'] = {
                instruction: '',
                Test: { instruction: '', wildcards: [] }
            };
        });

        await page.waitForTimeout(500);

        const templatesCategory = page.locator('details[data-path="0_TEMPLATES"]');
        await templatesCategory.click();

        await page.locator('[data-path="0_TEMPLATES/Test"] .generate-btn').click();
        await expect(page.getByText('Select Template Sources')).toBeVisible();

        // Click Cancel
        await page.getByRole('button', { name: 'Cancel' }).click();

        // Dialog should close
        await expect(page.locator('#notification-dialog')).not.toBeVisible();
    });
});
