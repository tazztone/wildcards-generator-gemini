const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Mock data
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

    // Use 8081
    await page.goto('http://localhost:8081/');

    // Trigger focus path
    await page.evaluate(() => {
        const event = new CustomEvent('request-focus-path', { detail: { path: 'Top/Mid/Bot' } });
        document.dispatchEvent(event);
    });

    // Wait for animation/scroll
    await page.waitForTimeout(1000);

    // Screenshot
    await page.screenshot({ path: '/home/jules/verification/breadcrumbs_focus.png', fullPage: true });

    await browser.close();
})();
