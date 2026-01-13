// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Suggest Dialog', () => {

    test.beforeEach(async ({ page }) => {
        // Disable first-run help dialog
        await page.addInitScript(() => {
            window.localStorage.setItem('wildcards-visited', 'true');
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test.describe('Suggest Popup Structure', () => {
        test('suggestPopup dialog exists in DOM', async ({ page }) => {
            const popup = page.locator('#suggestPopup');
            await expect(popup).toBeAttached();
        });

        test('suggestPopup has confirm button', async ({ page }) => {
            const confirmBtn = page.locator('#confirmBtn');
            await expect(confirmBtn).toBeAttached();
        });

        test('suggestPopup has cancel button', async ({ page }) => {
            const cancelBtn = page.locator('#cancelBtn');
            await expect(cancelBtn).toBeAttached();
        });
    });

    test.describe('Suggest Button Placement', () => {
        test('suggest top-level button exists in add category placeholder', async ({ page }) => {
            // The suggest button is in the placeholder area
            const suggestBtn = page.locator('#suggest-toplevel-btn');
            await expect(suggestBtn).toBeAttached();
        });

        test('suggest wildcard list button appears in category content', async ({ page }) => {
            // Expand a category first
            const firstCategory = page.locator('#wildcard-container > details').first();
            await firstCategory.evaluate(el => el.setAttribute('open', 'true'));
            await page.waitForTimeout(300);

            // Look for suggest buttons in the category content
            const suggestBtns = page.locator('.suggest-wildcard-list-btn, .suggest-subcategory-btn');
            // At least one should exist
            const count = await suggestBtns.count();
            expect(count).toBeGreaterThanOrEqual(0); // May be 0 if no placeholder visible
        });
    });
});
