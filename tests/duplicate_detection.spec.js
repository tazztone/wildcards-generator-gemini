// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Unit tests for Duplicate Detection Logic
 * Tests the handleCheckDuplicates function and related duplicate management
 */
test.describe('Duplicate Detection Logic', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Wait for App to be exposed and initialized
        await page.waitForFunction(() => window.App && window.State && window.State.state);
    });

    test('No duplicates returns empty result', async ({ page }) => {
        // Setup state with unique wildcards
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['apple', 'banana', 'cherry'] },
                Category2: { instruction: '', wildcards: ['dog', 'cat', 'bird'] }
            };
            window.State._initProxy();
        });

        // Check duplicates - should find none
        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                lastDuplicates: window.App._lastDuplicates,
                duplicateMapSize: window.App._duplicateMap ? window.App._duplicateMap.size : 0
            };
        });

        expect(result.lastDuplicates).toHaveLength(0);
        expect(result.duplicateMapSize).toBe(0);
    });

    test('Detects exact duplicates within same category', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['apple', 'banana', 'apple'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(1);
        expect(result.duplicates[0].normalized).toBe('apple');
        expect(result.duplicates[0].count).toBe(2);
    });

    test('Case-insensitive duplicate matching', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['Apple', 'APPLE', 'apple'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(1);
        expect(result.duplicates[0].normalized).toBe('apple');
        expect(result.duplicates[0].count).toBe(3);
    });

    test('Detects duplicates across categories', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Fruits: { instruction: '', wildcards: ['apple', 'banana'] },
                RedThings: { instruction: '', wildcards: ['apple', 'fire'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(1);
        expect(result.duplicates[0].normalized).toBe('apple');
        // Verify locations span two categories
        const locations = result.duplicates[0].locations;
        expect(locations.length).toBe(2);
        expect(locations.map(l => l.path)).toContain('Fruits');
        expect(locations.map(l => l.path)).toContain('RedThings');
    });

    test('Handles nested categories correctly', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Parent: {
                    instruction: '',
                    Child1: { instruction: '', wildcards: ['shared', 'unique1'] },
                    Child2: { instruction: '', wildcards: ['shared', 'unique2'] }
                }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(1);
        expect(result.duplicates[0].normalized).toBe('shared');
        const locations = result.duplicates[0].locations;
        expect(locations.map(l => l.path)).toContain('Parent/Child1');
        expect(locations.map(l => l.path)).toContain('Parent/Child2');
    });

    test('Whitespace trimming in duplicate detection', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['  apple  ', 'apple', ' apple'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(1);
        expect(result.duplicates[0].count).toBe(3);
    });

    test('Multiple different duplicates detected', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['apple', 'banana', 'cherry'] },
                Category2: { instruction: '', wildcards: ['apple', 'banana', 'date'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length,
                duplicates: window.App._lastDuplicates
            };
        });

        expect(result.duplicateCount).toBe(2);
        const normalizedValues = result.duplicates.map(d => d.normalized).sort();
        expect(normalizedValues).toEqual(['apple', 'banana']);
    });

    test('Duplicate map is correctly populated', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: { instruction: '', wildcards: ['dupe1', 'dupe2'] },
                Category2: { instruction: '', wildcards: ['dupe1', 'dupe2', 'unique'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                mapSize: window.App._duplicateMap.size,
                hasDupe1: window.App._duplicateMap.has('dupe1'),
                hasDupe2: window.App._duplicateMap.has('dupe2'),
                hasUnique: window.App._duplicateMap.has('unique')
            };
        });

        expect(result.mapSize).toBe(2);
        expect(result.hasDupe1).toBe(true);
        expect(result.hasDupe2).toBe(true);
        expect(result.hasUnique).toBe(false);
    });

    test('Ignores instruction keys during scan', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                Category1: {
                    instruction: 'Generate similar items',
                    wildcards: ['apple']
                }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            // No duplicates should be found - instruction is not scanned
            return {
                duplicateCount: window.App._lastDuplicates.length
            };
        });

        expect(result.duplicateCount).toBe(0);
    });

    test('Empty categories handled gracefully', async ({ page }) => {
        await page.evaluate(() => {
            window.State._rawData.wildcards = {
                EmptyCategory: { instruction: '' },
                Category1: { instruction: '', wildcards: ['apple'] }
            };
            window.State._initProxy();
        });

        const result = await page.evaluate(() => {
            window.App.handleCheckDuplicates();
            return {
                duplicateCount: window.App._lastDuplicates.length
            };
        });

        // Should complete without error and find no duplicates
        expect(result.duplicateCount).toBe(0);
    });
});
