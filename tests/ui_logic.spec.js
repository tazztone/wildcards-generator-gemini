// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('UI Logic Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => window.State && window.UI && window.State.state);
    });

    test('Category Sorting: Pinned first, then Alphabetical', async ({ page }) => {
        await page.evaluate(() => {
            window.State.state.wildcards = {
                'C_Cat': { instruction: '' },
                'A_Cat': { instruction: '' },
                'B_Cat': { instruction: '' }
            };
            window.State.state.pinnedCategories = [];
            window.UI.renderAll();
        });

        let headers = await page.locator('.category-name').allTextContents();
        headers = headers.filter(t => t.includes('Cat'));
        expect(headers).toEqual(['A Cat', 'B Cat', 'C Cat']);

        await page.evaluate(() => {
            window.State.state.pinnedCategories.push('B_Cat');
            window.UI.renderAll();
        });

        headers = await page.locator('.category-name').allTextContents();
        headers = headers.filter(t => t.includes('Cat'));
        expect(headers).toEqual(['B Cat', 'A Cat', 'C Cat']);
    });

    test('Instruction key is hidden from UI', async ({ page }) => {
        await page.evaluate(() => {
            // Setup: TopLevel (Folder) -> SubCard (Card)
            window.State.state.wildcards = {
                'TopLevel': {
                    'SubCard': {
                        instruction: 'Secret Instruction',
                        wildcards: ['Item 1']
                    }
                }
            };
            window.UI.renderAll();
        });

        // Use specific selector to check the input for SubCard
        // SubCard is a wildcard card, so it's a div with data-path="TopLevel/SubCard"
        const inputVal = await page.locator('div[data-path="TopLevel/SubCard"] input.custom-instructions-input').inputValue();
        expect(inputVal).toBe('Secret Instruction');

        // Ensure 'instruction' is not displayed as text
        const catNames = await page.locator('.category-name').allTextContents();
        expect(catNames).not.toContain('instruction');

        const wcNames = await page.locator('.wildcard-name').allTextContents();
        expect(wcNames).not.toContain('instruction');
    });
});
