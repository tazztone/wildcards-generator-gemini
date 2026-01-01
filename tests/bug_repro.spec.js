// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Bug Reproduction', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('renaming a subcategory updates the UI and data-path', async ({ page }) => {
        // 1. Create a top-level category
        await page.locator('#add-category-placeholder-btn').click();
        await page.locator('#notification-dialog input').fill('ParentCat');
        await page.locator('#confirm-btn').click();
        await expect(page.locator('details[data-path="ParentCat"]')).toBeVisible();

        // 2. Expand Parent Category to make subcategory button visible
        // JS click to ensure summary click works
        const parent = page.locator('details[data-path="ParentCat"]');
        await parent.evaluate(el => el.setAttribute('open', 'true'));
        await page.waitForTimeout(200);

        // 3. Create a subcategory
        // Need to be specific about which add button (the one in the placeholder inside the content wrapper)
        const addBtn = parent.locator('.content-wrapper .add-subcategory-btn');
        await addBtn.scrollIntoViewIfNeeded();
        await addBtn.click();

        await page.locator('#notification-dialog input').fill('ChildCat');
        await page.locator('#confirm-btn').click();

        // BUG CHECK: Does ChildCat appear?
        const childSelector = 'details[data-path="ParentCat/ChildCat"]';
        await expect(page.locator(childSelector)).toBeVisible({ timeout: 2000 });

        // If it appeared (it might not if bug exists), try to rename it
        if (await page.locator(childSelector).isVisible()) {
            const childTitle = page.locator(`${childSelector} > summary .category-name`);
            await childTitle.click();
            await childTitle.fill('RenamedChild');
            await childTitle.blur();

            // BUG CHECK: Does it have the new path?
            const newSelector = 'details[data-path="ParentCat/RenamedChild"]';
            await expect(page.locator(newSelector)).toBeVisible();

            // Old one should be gone
            await expect(page.locator(childSelector)).toBeHidden();
        }
    });

    test('renaming a top-level category works', async ({ page }) => {
         // This is a control test to verify logic works for top-level
        await page.locator('#add-category-placeholder-btn').click();
        await page.locator('#notification-dialog input').fill('TopCat');
        await page.locator('#confirm-btn').click();

        const catTitle = page.locator('details[data-path="TopCat"] > summary .category-name');
        await catTitle.click();
        await catTitle.fill('RenamedTop');
        await catTitle.blur();

        await expect(page.locator('details[data-path="RenamedTop"]')).toBeVisible();
        await expect(page.locator('details[data-path="TopCat"]')).toBeHidden();
    });
});
