
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to local server
    await page.goto('http://localhost:8080');

    // Reset state
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.reload();

    // Open Settings
    await page.click('#settings-btn');
    await page.waitForSelector('#settings-dialog');

    // Select OpenRouter to ensure we see the API key input
    await page.selectOption('#api-endpoint', 'openrouter');

    // Find the API Key input group
    const settingsPanel = await page.locator('#settings-openrouter');
    const apiKeyInput = settingsPanel.locator('.api-key-input');

    // Fill with dummy key
    await apiKeyInput.fill('sk-or-test-key-12345');

    // Verify Copy Button exists
    const copyBtn = settingsPanel.locator('button[title="Copy API Key"]');
    if (await copyBtn.count() === 0) {
        console.error('Copy API Key button not found');
        process.exit(1);
    }

    // Verify Visibility Toggle works
    const toggleBtn = settingsPanel.locator('.toggle-visibility-btn');
    await toggleBtn.click();

    // Check if input type changed to text
    const type = await apiKeyInput.getAttribute('type');
    if (type !== 'text') {
        console.error('Visibility toggle did not change input type to text');
        process.exit(1);
    }

    // Take screenshot of the settings panel with the new buttons
    await page.screenshot({
        path: 'verification/settings-api-key-ux.png',
        clip: { x: 0, y: 0, width: 1000, height: 800 } // approximate clip, or full page
    });

    console.log('Verification successful');
    await browser.close();
})();
