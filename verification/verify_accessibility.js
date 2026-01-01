const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:8080/');

    // Wait for content to load
    await page.waitForSelector('details.group');

    // Check if skip link is present (it is visually hidden)
    const skipLink = await page.$('a[href="#wildcard-container"]');
    console.log('Skip link found:', !!skipLink);

    // Check delete button aria-label
    const deleteBtn = await page.$('details.group .delete-btn');
    const ariaLabel = await deleteBtn.getAttribute('aria-label');
    console.log('Delete button aria-label:', ariaLabel);

    // Take a screenshot showing the delete button (tooltip might show on hover)
    await deleteBtn.hover();
    await page.screenshot({ path: 'verification/accessibility_check.png' });

    await browser.close();
})();
