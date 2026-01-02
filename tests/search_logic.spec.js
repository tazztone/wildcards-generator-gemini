// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Search Logic', () => {

    test.beforeEach(async ({ page }) => {
        // Enable console log from browser to node
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        // Wait for UI to be initialized and search element to be cached
        await page.waitForFunction(() => window.UI && window.UI.elements && window.UI.elements.search);

        // Ensure some data exists
        await page.evaluate(() => {
            window.State.state.wildcards = {
                'Fantasy': {
                    'Dragon': { wildcards: ['Red Dragon', 'Blue Dragon'] },
                    'Elf': { wildcards: ['High Elf'] }
                },
                'SciFi': { wildcards: ['Space Ship'] }
            };
            window.UI.renderAll();
            // Open Fantasy so we can check initial visibility
            const fantasy = document.querySelector('details[data-path="Fantasy"]');
            if (fantasy) fantasy.open = true;
        });
    });

    test('Search should filter categories and wildcards', async ({ page }) => {
        // Verify initial state
        await expect(page.locator('div[data-path="Fantasy/Dragon"]')).toBeVisible();
        await expect(page.locator('div[data-path="Fantasy/Elf"]')).toBeVisible();

        // Search for 'Dragon'
        await page.fill('#search-wildcards', 'Dragon');

        // Force event dispatch just in case
        await page.evaluate(() => {
            const input = document.getElementById('search-wildcards');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Wait for potential debounce or event loop
        await page.waitForTimeout(1000);

        // Dragon card should be visible
        await expect(page.locator('div[data-path="Fantasy/Dragon"]')).toBeVisible();

        // Elf card should be hidden
        await expect(page.locator('div[data-path="Fantasy/Elf"]')).toBeHidden();

        // SciFi should be hidden
        await expect(page.locator('details[data-path="SciFi"]')).toBeHidden();
    });

    test('Search should show result count', async ({ page }) => {
        await page.fill('#search-wildcards', 'Dragon');
        await page.evaluate(() => {
            const input = document.getElementById('search-wildcards');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(1000);
        const count = await page.locator('#search-results-count').textContent();
        // console.log('Result Count:', count);
        expect(count).toMatch(/\d+/);
    });
});
