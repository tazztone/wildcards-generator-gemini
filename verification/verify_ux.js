
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to local server
    await page.goto('http://localhost:8080');

    // Wait for the page to load
    await page.waitForSelector('#wildcard-container');

    // Take a screenshot of the main page to verify layout and icons
    await page.screenshot({ path: 'verification/main_page.png', fullPage: true });

    // Open settings to check API settings (Clear button, etc.)
    await page.click('#settings-btn');
    await page.waitForSelector('#api-settings-container');

    // Ensure "OpenRouter" is selected or visible
    // Wait for the dynamic content in settings
    await page.waitForTimeout(500); // Wait for animations/rendering

    await page.screenshot({ path: 'verification/settings_dialog.png' });

    await browser.close();
})();
