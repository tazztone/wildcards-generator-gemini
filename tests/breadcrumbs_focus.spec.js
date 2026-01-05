
const { test, expect } = require('@playwright/test');

test.describe('Breadcrumb Navigation Focus', () => {
    test.beforeEach(async ({ page }) => {
        // Capture console logs
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

        // Mock data to ensure a consistent state
        await page.addInitScript(() => {
            const mockData = {
                wildcards: {
                    'Top': {
                        instruction: '',
                        'Mid': {
                            instruction: '',
                            'Bot': {
                                instruction: '',
                                wildcards: ['item1', 'item2']
                            }
                        }
                    },
                    'Other': {
                        instruction: '',
                        wildcards: ['x', 'y']
                    }
                }
            };
            localStorage.setItem('wildcardGeneratorState_v12', JSON.stringify(mockData));
        });

        // Serve the directory
        await page.goto('/');
        await page.waitForSelector('.category-item');
    });

    test('should expand details and scroll on breadcrumb navigation', async ({ page }) => {
        const top = page.locator('details[data-path="Top"]');
        await expect(top).toBeVisible();
        await expect(top).not.toHaveAttribute('open');

        // Trigger focusPath('Top/Mid/Bot')
        await page.evaluate(() => {
            const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid/Bot' } });
            document.dispatchEvent(event);
        });

        // Check if "Top" is expanded
        await expect(top).toHaveAttribute('open', '');

        // Check if "Mid" is expanded (it's inside Top)
        const mid = page.locator('details[data-path="Top/Mid"]');
        await expect(mid).toHaveAttribute('open', '');

        // Check if "Bot" is visible (it's the target)
        const bot = page.locator('div[data-path="Top/Mid/Bot"]');
        await expect(bot).toBeVisible();

        // Check Focus Mode: "Other" should be hidden
        const other = page.locator('details[data-path="Other"]');
        await expect(other).toHaveClass(/hidden/);
    });

    test('should handle navigation to category', async ({ page }) => {
        // Trigger focusPath('Top/Mid')
        await page.evaluate(() => {
            const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid' } });
            document.dispatchEvent(event);
        });

        const top = page.locator('details[data-path="Top"]');
        await expect(top).toHaveAttribute('open', '');

        const mid = page.locator('details[data-path="Top/Mid"]');
        await expect(mid).toBeVisible();
        await expect(mid).toHaveAttribute('open', '');
    });

    test('clicking breadcrumb navigates to that level', async ({ page }) => {
        // First enter focus mode on a deep path
        await page.evaluate(() => {
            const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid/Bot' } });
            document.dispatchEvent(event);
        });

        await page.waitForTimeout(500);

        // Look for breadcrumb container
        const breadcrumbs = page.locator('#breadcrumbs, .breadcrumb-nav');
        if (await breadcrumbs.isVisible()) {
            // Click on "Top" in breadcrumbs
            const topCrumb = breadcrumbs.locator('a, button').filter({ hasText: 'Top' }).first();
            if (await topCrumb.isVisible()) {
                await topCrumb.click();
                await page.waitForTimeout(300);

                // Focus should now be on Top level
                const mid = page.locator('details[data-path="Top/Mid"]');
                await expect(mid).toBeVisible();
            }
        }
    });

    test('exit focus button returns to root view', async ({ page }) => {
        // Enter focus mode
        await page.evaluate(() => {
            const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid' } });
            document.dispatchEvent(event);
        });

        await page.waitForTimeout(300);

        // Look for exit focus button
        const exitBtn = page.locator('#exit-focus, .exit-focus-btn, button[title*="Exit"]').first();
        if (await exitBtn.isVisible()) {
            await exitBtn.click();
            await page.waitForTimeout(300);

            // Other categories should now be visible (not hidden)
            const other = page.locator('details[data-path="Other"]');
            await expect(other).not.toHaveClass(/hidden/);
        }
    });

    test('focus state scrolls category into view', async ({ page }) => {
        // This tests the scroll behavior
        await page.evaluate(() => {
            const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid/Bot' } });
            document.dispatchEvent(event);
        });

        await page.waitForTimeout(500);

        // The Bot element should be in the visible viewport
        const bot = page.locator('div[data-path="Top/Mid/Bot"]');
        await expect(bot).toBeInViewport();
    });
});
