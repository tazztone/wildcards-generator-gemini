import { test, expect } from '@playwright/test';

test.describe('Drag and Drop Logic Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => typeof window.DragDrop !== 'undefined' && typeof window.State !== 'undefined');
        // Reset state
        await page.evaluate(async () => {
            await window.State.resetState(false);
            // Add some test data
            window.State.state.wildcards = {
                'FolderA': {
                    'Item1': { wildcards: ['a'] },
                    'FolderB': {
                        'Item2': { wildcards: ['b'] }
                    }
                },
                'FolderC': { instruction: 'I am a category' } // Empty category
            };
        });
    });

    test('should move item into another folder', async ({ page }) => {
        await page.evaluate(() => {
            // Move FolderA/Item1 to FolderC (append to end)
            window.DragDrop.moveItem('FolderA/Item1', 'FolderC', 'inside');
        });

        const result = await page.evaluate(() => {
            return {
                inOld: window.State.state.wildcards.FolderA.Item1,
                inNew: window.State.state.wildcards.FolderC.Item1
            };
        });

        expect(result.inOld).toBeUndefined();
        expect(result.inNew).toBeDefined();
        expect(result.inNew.wildcards[0]).toBe('a');
    });

    test('should move item to top level (simulated by moving to another top level item)', async ({ page }) => {
        await page.evaluate(() => {
            // Move FolderA/Item1 to be sibling of FolderC
            // position 'after' means we drop ON FolderC
            window.DragDrop.moveItem('FolderA/Item1', 'FolderC', 'after');
        });

        const result = await page.evaluate(() => {
            return {
                inOld: window.State.state.wildcards.FolderA.Item1,
                inNew: window.State.state.wildcards.Item1
            };
        });

        expect(result.inOld).toBeUndefined();
        expect(result.inNew).toBeDefined();
    });

    test('should prevent moving parent into child', async ({ page }) => {
        // This requires checking toast message or ensuring state didn't change
        // We'll check state
        await page.evaluate(() => {
            // Try to move FolderA into FolderA/FolderB
            window.DragDrop.moveItem('FolderA', 'FolderA/FolderB', 'inside');
        });

        const result = await page.evaluate(() => {
            return window.State.state.wildcards.FolderA;
        });

        expect(result).toBeDefined(); // Should still be at top
        // And FolderB should still be inside
        expect(result.FolderB).toBeDefined();
    });

    test('should handle duplicate name collision gracefully', async ({ page }) => {
        await page.evaluate(() => {
            // Create collision target
            window.State.state.wildcards.FolderC.Item1 = { wildcards: ['collision'] };
            // Try to move FolderA/Item1 to FolderC
            window.DragDrop.moveItem('FolderA/Item1', 'FolderC', 'inside');
        });

        const result = await page.evaluate(() => {
            return {
                original: window.State.state.wildcards.FolderA.Item1, // Should stay
                target: window.State.state.wildcards.FolderC.Item1 // Should remain as collision
            };
        });

        expect(result.original).toBeDefined();
        expect(result.target.wildcards[0]).toBe('collision');
    });

});
