
import { test, expect } from '@playwright/test';

test.describe('Pinned Categories', () => {
    test('Pinned categories should be sorted first', async ({ page }) => {
        // Load the page
        await page.goto('/');

        // Wait for initial load
        await page.waitForSelector('.category-item');

        // We assume "Characters" and "Objects" exist in initial data or similar.
        // Let's create two categories if we can't rely on initial data, but better to use existing flow.
        // Assuming clean slate or default data.

        // Let's create "Zeta" and "Alpha" categories.
        // Click Add Category placeholder button
        await page.click('#add-category-placeholder-btn');
        // Handle prompt dialog
        await expect(page.locator('#notification-dialog')).toBeVisible();
        await page.fill('#notification-dialog input', 'Zeta');
        await page.click('#confirm-btn');

        await page.click('#add-category-placeholder-btn');
        await expect(page.locator('#notification-dialog')).toBeVisible();
        await page.fill('#notification-dialog input', 'Alpha');
        await page.click('#confirm-btn');

        // Initial Order: Alpha, Zeta (alphabetical)
        // Check order of categories in DOM
        // Note: There might be other categories. We check relative order.

        const getCategoryOrder = async () => {
            return await page.evaluate(() => {
                const details = Array.from(document.querySelectorAll('.category-item'));
                return details.map(d => d.querySelector('.category-name').innerText.trim());
            });
        };

        let order = await getCategoryOrder();
        let alphaIndex = order.indexOf('Alpha');
        let zetaIndex = order.indexOf('Zeta');
        expect(alphaIndex).toBeLessThan(zetaIndex); // Alphabetical

        // Pin "Zeta"
        // Find the Zeta category details element
        const zetaDetails = page.locator('details[data-path="Zeta"]');
        await zetaDetails.locator('.pin-btn').click();

        // Wait for UI update (pinning triggers State update which triggers renderAll in current implementation?)
        // Wait for re-render or update.
        await page.waitForTimeout(500); // Small wait for update

        // New Order: Zeta should be before Alpha (and likely first among unpinned, or first overall)
        order = await getCategoryOrder();
        alphaIndex = order.indexOf('Alpha');
        zetaIndex = order.indexOf('Zeta');

        expect(zetaIndex).toBeLessThan(alphaIndex);

        // Unpin "Zeta"
        await zetaDetails.locator('.pin-btn').click();
        await page.waitForTimeout(500);

        // Back to Alphabetical
        order = await getCategoryOrder();
        alphaIndex = order.indexOf('Alpha');
        zetaIndex = order.indexOf('Zeta');
        expect(alphaIndex).toBeLessThan(zetaIndex);
    });
});
