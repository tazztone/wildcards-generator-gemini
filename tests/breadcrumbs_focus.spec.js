
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
});
