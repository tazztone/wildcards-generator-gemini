const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Go to app
    await page.goto('http://localhost:8080');

    // Wait for wildcards to load
    await page.waitForSelector('.category-item');

    // Take a screenshot of the whole container to see tints
    const element = await page.locator('#wildcard-container');
    await element.screenshot({ path: 'verification/tinting.png' });

    await browser.close();
})();
