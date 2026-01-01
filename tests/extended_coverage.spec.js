// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Extended Coverage Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    // =========================================================================
    // API Error Handling
    // =========================================================================
    test.describe('API Error Handling', () => {
        test('handles API 500 error gracefully', async ({ page }) => {
            // Mock API failure
            await page.route('**/models*', route => route.fulfill({
                status: 500,
                body: 'Internal Server Error'
            }));

            await page.locator('button[title="Global Settings"]').click();

            // Switch to Gemini to trigger a test connection or just click Test Connection if available
            // Note: Settings panel renders dynamically.
            // Let's use the Test Connection button for OpenRouter (default)
            const testBtn = page.locator('#settings-openrouter .test-conn-btn');
            await expect(testBtn).toBeVisible();
            await testBtn.click();

            // Should show error toast
            const toast = page.locator('.toast.error');
            await expect(toast).toBeVisible();
            await expect(toast).toContainText('Connection failed');
        });

        test('handles Network Error gracefully', async ({ page }) => {
             // Mock Network Error
            await page.route('**/models*', route => route.abort('failed'));

            await page.locator('button[title="Global Settings"]').click();
            const testBtn = page.locator('#settings-openrouter .test-conn-btn');
            await testBtn.click();

            const toast = page.locator('.toast.error');
            await expect(toast).toBeVisible();
        });
    });

    // =========================================================================
    // Drag and Drop
    // =========================================================================
    test.describe('Drag and Drop', () => {
        test('moving a subcategory to another parent', async ({ page }) => {
            // Setup: Create Source Parent, Child, Dest Parent
            // 1. Create Source
            await page.locator('#add-category-placeholder-btn').click();
            await page.locator('#notification-dialog input').fill('SourceFolder');
            await page.locator('#confirm-btn').click();

            // 2. Create Dest
            await page.locator('#add-category-placeholder-btn').click();
            await page.locator('#notification-dialog input').fill('DestFolder');
            await page.locator('#confirm-btn').click();

            // 3. Create Child in Source
            const source = page.locator('details[data-path="SourceFolder"]');
            await source.evaluate(el => el.setAttribute('open', 'true'));
            await page.waitForTimeout(200);

            const addBtn = source.locator('.content-wrapper .add-subcategory-btn');
            await addBtn.click();
            await page.locator('#notification-dialog input').fill('MovingChild');
            await page.locator('#confirm-btn').click();

            const child = page.locator('details[data-path="SourceFolder/MovingChild"]');
            await expect(child).toBeVisible();

            const dest = page.locator('details[data-path="DestFolder"]');

            // Perform Drag and Drop
            // We need to drag specifically to the CENTER of the destination to trigger 'inside'
            // Playwright dragTo targetPosition option can help?
            // Default is center.

            await child.dragTo(dest, {
                sourcePosition: { x: 10, y: 10 },
                targetPosition: { x: 50, y: 30 } // Relative pixels? No, it's relative to element.
                // We assume element has some height.
            });

            // Wait for logic
            await page.waitForTimeout(1000);

            // Verification
            // Child should be gone from Source
            await expect(page.locator('details[data-path="SourceFolder/MovingChild"]')).toBeHidden();

            // Dest path should be DestFolder/MovingChild
            // We need to expand Dest to ensure it renders if logic requires expansion?
            // Our logic renders all children.
            await dest.evaluate(el => el.setAttribute('open', 'true'));

            const movedChild = page.locator('details[data-path="DestFolder/MovingChild"]');
            await expect(movedChild).toBeVisible().catch(async () => {
                 // Debug: Take screenshot if fail
                 await page.screenshot({ path: 'drag-fail.png' });
                 throw new Error("Moved child not found in destination");
            });
        });
    });

    // =========================================================================
    // Import/Export Content Verification
    // =========================================================================
    test.describe('Import/Export Content', () => {
        test('Export YAML contains correct data', async ({ page }) => {
            // Add a unique item
            await page.locator('#add-category-placeholder-btn').click();
            await page.locator('#notification-dialog input').fill('ExportTestCat');
            await page.locator('#confirm-btn').click();

            const downloadPromise = page.waitForEvent('download');
            await page.locator('#export-yaml').click();
            const download = await downloadPromise;

            const stream = await download.createReadStream();
            const buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const content = Buffer.concat(buffers).toString('utf-8');

            expect(content).toContain('ExportTestCat');
            expect(content).toContain('wildcards:');
        });
    });
});
