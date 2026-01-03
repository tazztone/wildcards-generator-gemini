
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    // Ensure directory exists
    const dir = '/home/jules/verification';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
        await page.goto('http://localhost:8080');

        // Reset state
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload();
        await page.waitForSelector('#wildcard-container');

        // 1. Create Data for Empty State Verification
        // Add Category
        await page.click('#add-category-placeholder-btn');
        await page.waitForSelector('#notification-dialog[open]');
        await page.fill('#notification-message input', 'Visual Test Category');
        await page.click('#confirm-btn');
        await page.waitForTimeout(500); // Wait for anim

        // Open Category
        const category = page.locator('details[data-path="Visual Test Category"]');
        await category.evaluate(el => el.open = true);

        // Add Wildcard List
        await category.locator('.add-wildcard-list-btn').click();
        await page.waitForSelector('#notification-dialog[open]');
        await page.fill('#notification-message input', 'Empty List');
        await page.click('#confirm-btn');
        await page.locator('#notification-dialog').waitFor({ state: 'hidden' });

        // Wait for card
        const card = page.locator('.wildcard-card').filter({ hasText: 'Empty List' });
        await card.waitFor();

        // 2. Open Settings for Refresh Button Verification
        await page.click('#settings-btn');
        await page.waitForSelector('#settings-dialog');
        await page.selectOption('#api-endpoint', 'openrouter');

        // Take Screenshot
        await page.screenshot({ path: path.join(dir, 'verification.png'), fullPage: true });
        console.log('Screenshot saved to ' + path.join(dir, 'verification.png'));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
