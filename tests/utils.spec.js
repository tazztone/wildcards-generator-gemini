// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Utils Unit Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('sanitize function escapes HTML', async ({ page }) => {
        const result = await page.evaluate(async () => {
            // Import utils dynamically
            const { sanitize } = await import('./js/utils.js');
            return sanitize('<script>alert("xss")</script>');
        });

        expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    test('debounce function delays execution', async ({ page }) => {
        const result = await page.evaluate(async () => {
             const { debounce } = await import('./js/utils.js');
             let counter = 0;
             const inc = debounce(() => counter++, 50);

             inc();
             inc();
             inc();

             // Wait less than delay
             await new Promise(r => setTimeout(r, 10));
             const check1 = counter;

             // Wait more than delay
             await new Promise(r => setTimeout(r, 60));
             const check2 = counter;

             return { check1, check2 };
        });

        expect(result.check1).toBe(0);
        expect(result.check2).toBe(1);
    });
});
