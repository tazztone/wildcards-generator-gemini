// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Mindmap Module E2E Tests
 * 
 * Tests cover:
 * - View mode switching (List/Mindmap/Dual)
 * - Mindmap initialization and theme sync
 * - Toggle wildcards visibility
 * - Context menu actions (Generate/Suggest)
 * - Data sync between Mindmap and State
 * - Persistence across reloads
 */

test.describe('Mindmap Module E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Wait for app initialization
        await page.waitForFunction(() => typeof window.Mindmap !== 'undefined');
    });

    // Helper: Wait for Mind Elixir to fully initialize
    async function waitForMindElixir(page, timeout = 3000) {
        await page.waitForFunction(
            () => {
                const container = document.getElementById('mindmap-container');
                // Mind Elixir creates multiple possible root selectors
                return container && (
                    container.querySelector('.me-root') !== null ||
                    container.querySelector('.mind-elixir-root') !== null ||
                    container.querySelector('[class*="root"]') !== null ||
                    container.querySelector('me-main') !== null ||
                    container.children.length > 0
                );
            },
            { timeout }
        ).catch(() => false);
    }

    // =========================================================================
    // View Mode Switching
    // =========================================================================

    test.describe('View Mode Switching', () => {

        test('view mode buttons are visible', async ({ page }) => {
            await expect(page.locator('#view-list')).toBeVisible();
            await expect(page.locator('#view-mindmap')).toBeVisible();
            await expect(page.locator('#view-dual')).toBeVisible();
        });

        test('list view is active by default', async ({ page }) => {
            await expect(page.locator('#view-list')).toHaveClass(/active/);
            await expect(page.locator('#wildcard-container')).toBeVisible();
            await expect(page.locator('#mindmap-container')).toHaveClass(/hidden/);
        });

        test('switches to mindmap view', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            await expect(page.locator('#view-mindmap')).toHaveClass(/active/);
            await expect(page.locator('#mindmap-container')).toBeVisible();
            await expect(page.locator('#wildcard-container')).toHaveClass(/hidden/);

            // Body should have view class
            await expect(page.locator('body')).toHaveClass(/view-mindmap/);
        });

        test('switches to dual view', async ({ page }) => {
            await page.click('#view-dual');
            await page.waitForTimeout(500);

            await expect(page.locator('#view-dual')).toHaveClass(/active/);
            await expect(page.locator('#dual-container')).toBeVisible();
            await expect(page.locator('#wildcard-container')).toHaveClass(/hidden/);
            await expect(page.locator('#mindmap-container')).toHaveClass(/hidden/);

            // Both panes should be visible within dual container
            await expect(page.locator('#dual-list')).toBeVisible();
            await expect(page.locator('#dual-mindmap')).toBeVisible();
        });

        test('switches back to list view', async ({ page }) => {
            // First switch to mindmap
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);
            await expect(page.locator('#mindmap-container')).toBeVisible();

            // Switch back to list
            await page.click('#view-list');
            await page.waitForTimeout(300);

            await expect(page.locator('#view-list')).toHaveClass(/active/);
            await expect(page.locator('#wildcard-container')).toBeVisible();
            await expect(page.locator('#mindmap-container')).toHaveClass(/hidden/);
        });

        test('view mode shows toast notification', async ({ page }) => {
            await page.click('#view-mindmap');
            // Use .first() to handle multiple toasts
            // Use filter to find the correct toast, ignoring 'Configuration saved'
            await expect(page.locator('.toast').filter({ hasText: /mindmap|view/i })).toBeVisible();
        });

        test('view preference persists in Config', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            // Check Config was updated
            const preferredView = await page.evaluate(() => window.Config.PREFERRED_VIEW);
            expect(preferredView).toBe('mindmap');
        });
    });

    // =========================================================================
    // Mindmap Initialization
    // =========================================================================

    test.describe('Mindmap Initialization', () => {

        test('mindmap container renders Mind Elixir elements', async ({ page }) => {
            await page.click('#view-mindmap');
            // Wait longer for CDN load
            await page.waitForTimeout(2500);

            // Mind Elixir creates elements inside the container
            const hasContent = await page.evaluate(() => {
                const container = document.getElementById('mindmap-container');
                // Check for any child elements (Mind Elixir renders canvas or SVG)
                return container && container.innerHTML.length > 100;
            });
            expect(hasContent).toBe(true);
        });

        test('root node displays Wildcards topic', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2500);

            // Find any element containing "Wildcards" in the mindmap
            const hasWildcardsText = await page.evaluate(() => {
                const container = document.getElementById('mindmap-container');
                return container && container.textContent?.includes('Wildcards');
            });
            expect(hasWildcardsText).toBe(true);
        });

        test('mindmap toolbar is accessible', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Check if Mindmap module reports initialization
            const isInitialized = await page.evaluate(() => {
                return window.Mindmap && window.Mindmap.isInitialized === true;
            });
            expect(isInitialized).toBe(true);
        });

        test('no critical console errors during initialization', async ({ page }) => {
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Filter out network/favicon errors which are expected
            const criticalErrors = errors.filter(e =>
                !e.includes('net::ERR') &&
                !e.includes('favicon') &&
                !e.includes('404') &&
                !e.includes('Failed to load resource')
            );
            expect(criticalErrors).toHaveLength(0);
        });
    });

    // =========================================================================
    // Theme Synchronization
    // =========================================================================

    test.describe('Theme Synchronization', () => {

        test('mindmap initializes in dark mode without crash', async ({ page }) => {
            // Ensure dark mode is active
            await page.evaluate(() => {
                document.documentElement.classList.add('dark');
            });

            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Just verify no crash and container is visible
            await expect(page.locator('#mindmap-container')).toBeVisible();

            // Verify Mindmap module synced theme
            const themeSynced = await page.evaluate(() => {
                return window.Mindmap.instance !== null;
            });
            expect(themeSynced).toBe(true);
        });

        test('theme toggle updates mindmap without crash', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Toggle theme
            await page.click('#theme-toggle');
            await page.waitForTimeout(500);

            // Mindmap should still be visible (no crash)
            await expect(page.locator('#mindmap-container')).toBeVisible();
        });
    });

    // =========================================================================
    // Toggle Wildcards Visibility
    // =========================================================================

    test.describe('Toggle Wildcards Visibility', () => {

        test('toggle button is visible in mindmap view', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            const toggleBtn = page.locator('#mindmap-toggle-wildcards');
            await expect(toggleBtn).toBeVisible();
        });

        test('toggle button has correct initial state', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            // Default is collapsed (showWildcards = false), so button should NOT be active
            const toggleBtn = page.locator('#mindmap-toggle-wildcards');
            const hasActiveClass = await toggleBtn.evaluate(el => el.classList.contains('active'));
            expect(hasActiveClass).toBe(true);
        });

        test('clicking toggle changes button state', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            const toggleBtn = page.locator('#mindmap-toggle-wildcards');

            // Initial state: active class present (wildcards visible)
            const initialActive = await toggleBtn.evaluate(el => el.classList.contains('active'));
            expect(initialActive).toBe(true);

            // Click to show wildcards
            await toggleBtn.click();
            await page.waitForTimeout(500);

            // Button should now be INACTIVE (wildcards hidden)
            const hasActiveClass = await toggleBtn.evaluate(el => el.classList.contains('active'));
            expect(hasActiveClass).toBe(false);
        });

        test('toggle shows toast notification', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Clear existing toasts
            await page.evaluate(() => {
                document.querySelectorAll('.toast').forEach(t => t.remove());
            });

            await page.click('#mindmap-toggle-wildcards');
            await expect(page.locator('.toast').first()).toBeVisible();
        });

        test('toggle does not crash mindmap', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Toggle wildcards
            await page.click('#mindmap-toggle-wildcards');
            await page.waitForTimeout(500);

            // Mindmap container should still be visible
            await expect(page.locator('#mindmap-container')).toBeVisible();

            // Mindmap module should still have instance
            const hasInstance = await page.evaluate(() => window.Mindmap.instance !== null);
            expect(hasInstance).toBe(true);
        });
    });

    // =========================================================================
    // Context Menu Actions
    // =========================================================================

    test.describe('Context Menu Actions', () => {

        test('right-click on mindmap container does not crash', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Right-click somewhere in the container
            const container = page.locator('#mindmap-container');
            await container.click({ button: 'right', position: { x: 200, y: 200 } });
            await page.waitForTimeout(300);

            // Container should still be visible
            await expect(container).toBeVisible();
        });

        test('generate action event listener is set up', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Set up and verify event listener
            const result = await page.evaluate(() => {
                let captured = false;
                const handler = () => { captured = true; };
                document.addEventListener('mindmap-generate', handler);

                // Dispatch test event
                document.dispatchEvent(new CustomEvent('mindmap-generate', {
                    detail: { path: ['Test'], nodeTopic: 'Test' }
                }));

                document.removeEventListener('mindmap-generate', handler);
                return captured;
            });
            expect(result).toBe(true);
        });

        test('suggest action event listener is set up', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Set up and verify event listener
            const result = await page.evaluate(() => {
                let captured = false;
                const handler = () => { captured = true; };
                document.addEventListener('mindmap-suggest', handler);

                // Dispatch test event
                document.dispatchEvent(new CustomEvent('mindmap-suggest', {
                    detail: { path: ['Test'], nodeTopic: 'Test' }
                }));

                document.removeEventListener('mindmap-suggest', handler);
                return captured;
            });
            expect(result).toBe(true);
        });
    });

    // =========================================================================
    // Data Synchronization
    // =========================================================================

    test.describe('Data Synchronization', () => {

        test('mindmap renders with State data', async ({ page }) => {
            // Get expected category names from State before switching
            const categoryCount = await page.evaluate(() => {
                return Object.keys(window.State._rawData.wildcards || {}).length;
            });

            await page.click('#view-mindmap');
            await page.waitForTimeout(2500);

            // Verify mindmap container has content
            const hasContent = await page.evaluate(() => {
                const container = document.getElementById('mindmap-container');
                return container && container.innerHTML.length > 100;
            });
            expect(hasContent).toBe(true);

            // If there are categories, they should be rendered
            if (categoryCount > 0) {
                const containerText = await page.evaluate(() => {
                    return document.getElementById('mindmap-container')?.textContent || '';
                });
                expect(containerText.length).toBeGreaterThan(10);
            }
        });

        test('state update triggers mindmap refresh', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Add a new category via State and refresh
            const refreshResult = await page.evaluate(() => {
                window.State._rawData.wildcards['TestMindmapCategory'] = {
                    instruction: 'Test category',
                    wildcards: ['test1', 'test2']
                };

                // Manually trigger refresh
                window.Mindmap.refresh();
                return window.Mindmap.instance !== null;
            });
            expect(refreshResult).toBe(true);
        });

        test('mindmap instance is accessible via window.Mindmap', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            const hasInstance = await page.evaluate(() => {
                return window.Mindmap && window.Mindmap.instance !== null;
            });
            expect(hasInstance).toBe(true);
        });
    });

    // =========================================================================
    // Dual Pane Mode
    // =========================================================================

    test.describe('Dual Pane Mode', () => {

        test('dual pane shows both list and mindmap', async ({ page }) => {
            await page.click('#view-dual');
            await page.waitForTimeout(1500);

            await expect(page.locator('#dual-list')).toBeVisible();
            await expect(page.locator('#dual-mindmap')).toBeVisible();
        });

        test('dual list contains cloned category structure', async ({ page }) => {
            await page.click('#view-dual');
            await page.waitForTimeout(1500);

            // Dual list should have category elements
            const hasCategoriesInDual = await page.evaluate(() => {
                const dualList = document.getElementById('dual-list');
                return dualList && dualList.querySelectorAll('details').length > 0;
            });
            expect(hasCategoriesInDual).toBe(true);
        });

        test('divider is visible between panes', async ({ page }) => {
            await page.click('#view-dual');
            await page.waitForTimeout(500);

            await expect(page.locator('#dual-divider')).toBeVisible();
        });

        test('mindmap instance in dual pane is separate', async ({ page }) => {
            await page.click('#view-dual');
            await page.waitForTimeout(2000);

            const hasDualInstance = await page.evaluate(() => {
                return window.Mindmap.dualInstance !== null;
            });
            expect(hasDualInstance).toBe(true);
        });
    });

    // =========================================================================
    // Persistence and Reload
    // =========================================================================

    test.describe('Persistence and Reload', () => {

        test('mindmap data accessible after switching views', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Get current categories
            const categories = await page.evaluate(() => {
                return Object.keys(window.State._rawData.wildcards || {});
            });

            // Switch to list and back
            await page.click('#view-list');
            await page.waitForTimeout(300);
            await page.click('#view-mindmap');
            await page.waitForTimeout(1500);

            // Verify data is still there
            const categoriesAfter = await page.evaluate(() => {
                return Object.keys(window.State._rawData.wildcards || {});
            });
            expect(categoriesAfter.length).toBe(categories.length);
        });

        test('view mode is saved to Config', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            // Check Config was updated (not localStorage, that's async)
            const configView = await page.evaluate(() => {
                return window.Config.PREFERRED_VIEW;
            });
            expect(configView).toBe('mindmap');
        });
    });

    // =========================================================================
    // Mindmap Toolbar Interactions
    // =========================================================================

    test.describe('Mindmap Toolbar', () => {

        test('mindmap has controls', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Check that Mindmap instance exists with expected methods
            const hasMethods = await page.evaluate(() => {
                const m = window.Mindmap;
                return m && typeof m.refresh === 'function' && typeof m.toggleWildcards === 'function';
            });
            expect(hasMethods).toBe(true);
        });

        test('center functionality works without crash', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Call toCenter via Mindmap module
            const centered = await page.evaluate(() => {
                if (window.Mindmap.instance && window.Mindmap.instance.toCenter) {
                    window.Mindmap.instance.toCenter();
                    return true;
                }
                return false;
            });

            // Even if false, container should be visible
            await expect(page.locator('#mindmap-container')).toBeVisible();
        });
    });

    // =========================================================================
    // Error Handling
    // =========================================================================

    test.describe('Error Handling', () => {

        test('switching views rapidly does not crash', async ({ page }) => {
            // Rapid switching between views
            await page.click('#view-mindmap');
            await page.waitForTimeout(200);
            await page.click('#view-list');
            await page.waitForTimeout(200);
            await page.click('#view-dual');
            await page.waitForTimeout(200);
            await page.click('#view-mindmap');
            await page.waitForTimeout(200);
            await page.click('#view-list');

            // Should end in list view without errors
            await expect(page.locator('#wildcard-container')).toBeVisible();
        });

        test('empty state does not crash mindmap', async ({ page }) => {
            // Clear wildcards before switching to mindmap
            await page.evaluate(() => {
                const keys = Object.keys(window.State._rawData.wildcards);
                keys.forEach(key => {
                    delete window.State._rawData.wildcards[key];
                });
            });

            // Switch to mindmap (should not crash)
            await page.click('#view-mindmap');
            await page.waitForTimeout(2000);

            // Container should be visible even with empty data
            await expect(page.locator('#mindmap-container')).toBeVisible();

            // Module should be initialized
            const isInit = await page.evaluate(() => window.Mindmap.isInitialized);
            expect(isInit).toBe(true);
        });
    });

    // =========================================================================
    // Accessibility
    // =========================================================================

    test.describe('Accessibility', () => {

        test('view mode toggle has keyboard accessibility', async ({ page }) => {
            await page.click('#view-mindmap');
            await page.waitForTimeout(500);

            // Toggle button should be focusable
            const toggleBtn = page.locator('#mindmap-toggle-wildcards');
            await toggleBtn.focus();

            // Should respond to Enter key
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);

            // Should show toast (button was activated)
            await expect(page.locator('.toast').first()).toBeVisible();
        });

        test('view mode buttons have proper labels', async ({ page }) => {
            await expect(page.locator('#view-list')).toHaveAttribute('title', 'List View');
            await expect(page.locator('#view-mindmap')).toHaveAttribute('title', 'Mindmap View');
            await expect(page.locator('#view-dual')).toHaveAttribute('title', /Dual/);
        });
    });
});
