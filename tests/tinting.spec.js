
import { test, expect } from '@playwright/test';

test.describe('Category Tinting', () => {

    test('should apply tint classes to top-level categories', async ({ page }) => {
        // Go to app
        await page.goto('http://localhost:8080');

        // Wait for wildcards to load
        await page.waitForSelector('.category-item');

        // Check if tint classes are applied
        // We expect at least one category to have a class starting with 'category-tint-'
        const categories = await page.locator('.level-0.category-item').all();

        expect(categories.length).toBeGreaterThan(0);

        let foundTint = false;
        for (const cat of categories) {
            const classList = await cat.getAttribute('class');
            if (classList.includes('category-tint-')) {
                foundTint = true;
                break;
            }
        }

        // As per plan, this should fail now if the feature is disabled
        expect(foundTint).toBeTruthy();
    });

    test('should apply different tints based on index', async ({ page }) => {
         await page.goto('http://localhost:8080');
         await page.waitForSelector('.category-item');

         const categories = page.locator('.level-0.category-item');
         const count = await categories.count();

         if (count < 2) {
             console.log('Not enough categories to test tint variation');
             return;
         }

         // Get classes of first two categories
         const class1 = await categories.nth(0).getAttribute('class');
         const class2 = await categories.nth(1).getAttribute('class');

         const tint1 = class1.match(/category-tint-(\d+)/);
         const tint2 = class2.match(/category-tint-(\d+)/);

         expect(tint1).not.toBeNull();
         expect(tint2).not.toBeNull();

         // If indices are 0 and 1, tints should be 1 and 2.
         expect(tint1[1]).not.toBe(tint2[1]);
    });
});
