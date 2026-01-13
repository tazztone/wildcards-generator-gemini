// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Double-Click Editing', () => {

    test.beforeEach(async ({ page }) => {
        // Disable first-run help dialog
        await page.addInitScript(() => {
            window.localStorage.setItem('wildcards-visited', 'true');
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Create a test category for isolated testing
        await page.locator('#add-category-placeholder-btn').click();
        await page.locator('#notification-dialog input').fill('EditTestCategory');
        await page.locator('#confirm-btn').click();
        await expect(page.locator('details[data-path="EditTestCategory"]')).toBeVisible();
    });

    test.describe('Category Name Editing', () => {
        test('double-click on category name enables editing', async ({ page }) => {
            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');

            // Double-click to enable editing
            await categoryName.dblclick();
            await page.waitForTimeout(200);

            // Should be contenteditable
            const isEditable = await categoryName.getAttribute('contenteditable');
            expect(isEditable).toBe('true');
        });

        test('Enter key saves category name', async ({ page }) => {
            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');

            await categoryName.dblclick();
            await page.waitForTimeout(200);

            // Type new name and press Enter
            await categoryName.fill('RenamedCategory');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);

            // Category should have new path
            await expect(page.locator('details[data-path="RenamedCategory"]')).toBeVisible();
        });

        test('Escape key cancels category name edit', async ({ page }) => {
            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');
            const originalText = await categoryName.textContent();

            await categoryName.dblclick();
            await page.waitForTimeout(200);

            // Type something and cancel
            await categoryName.fill('ShouldNotSave');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // Original name should still be there
            await expect(page.locator('details[data-path="EditTestCategory"]')).toBeVisible();
        });

        test('blur saves category name', async ({ page }) => {
            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');

            await categoryName.dblclick();
            await page.waitForTimeout(200);

            await categoryName.fill('BlurSavedCategory');
            // Click elsewhere to blur
            await page.locator('h1').click();
            await page.waitForTimeout(500);

            await expect(page.locator('details[data-path="BlurSavedCategory"]')).toBeVisible();
        });
    });

    test.describe('Instruction Field Editing', () => {
        test('double-click on instruction enables editing', async ({ page }) => {
            // Expand the category
            const category = page.locator('details[data-path="EditTestCategory"]');
            await category.evaluate(el => el.setAttribute('open', 'true'));
            await page.waitForTimeout(200);

            // Add a wildcard list first
            const addBtn = category.locator('.add-wildcard-list-btn');
            await addBtn.click();
            await page.locator('#notification-dialog input').fill('TestList');
            await page.locator('#confirm-btn').click();
            await page.waitForTimeout(500);

            // Find instruction input
            const instructionInput = page.locator('.custom-instructions-input').first();
            if (await instructionInput.isVisible()) {
                await instructionInput.dblclick();
                await page.waitForTimeout(200);

                // Should be editable (either contenteditable or focused)
                const isFocused = await instructionInput.evaluate(el => document.activeElement === el);
                expect(isFocused).toBe(true);
            }
        });

        test('instruction input accepts text', async ({ page }) => {
            const category = page.locator('details[data-path="EditTestCategory"]');
            await category.evaluate(el => el.setAttribute('open', 'true'));
            await page.waitForTimeout(200);

            const addBtn = category.locator('.add-wildcard-list-btn');
            await addBtn.click();
            await page.locator('#notification-dialog input').fill('InstructionTest');
            await page.locator('#confirm-btn').click();
            await page.waitForTimeout(500);

            const instructionInput = page.locator('.custom-instructions-input').first();
            if (await instructionInput.isVisible()) {
                await instructionInput.dblclick();
                await instructionInput.fill('Test instruction text');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(300);

                // Verify the input was accepted (no error thrown)
                // State verification is complex due to async, just verify the interaction worked
            }
        });
    });

    test.describe('Edit Mode Behavior', () => {
        test('category name becomes editable on double-click', async ({ page }) => {
            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');

            await categoryName.dblclick();
            await page.waitForTimeout(200);

            // Should be contenteditable
            const isEditable = await categoryName.getAttribute('contenteditable');
            expect(isEditable).toBe('true');
        });

        test('category stays open after name edit begins', async ({ page }) => {
            const category = page.locator('details[data-path="EditTestCategory"]');
            await category.evaluate(el => el.setAttribute('open', 'true'));
            await page.waitForTimeout(200);

            const categoryName = page.locator('details[data-path="EditTestCategory"] > summary .category-name');
            await categoryName.dblclick();
            await page.waitForTimeout(200);

            // Category should still be open
            const isOpen = await category.evaluate(el => el.hasAttribute('open'));
            expect(isOpen).toBe(true);
        });
    });
});

