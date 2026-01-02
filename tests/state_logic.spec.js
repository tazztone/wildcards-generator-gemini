// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('State Management Logic', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        // Wait for State to be exposed and initialized
        await page.waitForFunction(() => window.State && window.State.state);
    });

    test('Deep proxy triggers updates on nested change', async ({ page }) => {
        await page.evaluate(async () => {
            // Setup a test path
            window.State.state.wildcards.TestCategory = { instruction: 'test', wildcards: ['item1'] };
        });

        const val = await page.evaluate(() => window.State.state.wildcards.TestCategory.wildcards[0]);
        expect(val).toBe('item1');

        await page.evaluate(() => {
            window.State.saveStateToHistory();
            window.State.state.wildcards.TestCategory.wildcards[0] = 'item2';
        });

        const newVal = await page.evaluate(() => window.State.state.wildcards.TestCategory.wildcards[0]);
        expect(newVal).toBe('item2');

        const historyLen = await page.evaluate(() => window.State.history.length);
        expect(historyLen).toBeGreaterThan(0);
    });

    test('Undo/Redo restores state correctly', async ({ page }) => {
        await page.evaluate(async () => {
             window.State._rawData.wildcards = {};
             window.State._initProxy();

             // Step 1
             window.State.state.wildcards.UndoTest = { instruction: '', wildcards: ['step1'] };
             window.State.saveStateToHistory();
        });

        // Step 2
        await page.evaluate(() => {
            window.State.state.wildcards.UndoTest.wildcards[0] = 'step2';
            window.State.saveStateToHistory();
        });

        let val = await page.evaluate(() => window.State.state.wildcards.UndoTest.wildcards[0]);
        expect(val).toBe('step2');

        await page.evaluate(() => window.State.undo());
        val = await page.evaluate(() => window.State.state.wildcards.UndoTest.wildcards[0]);
        expect(val).toBe('step1');

        await page.evaluate(() => window.State.redo());
        val = await page.evaluate(() => window.State.state.wildcards.UndoTest.wildcards[0]);
        expect(val).toBe('step2');
    });

    test('Deleting a property triggers update and is undoable', async ({ page }) => {
        // Increase timeout for this specific test
        test.setTimeout(60000);

        await page.evaluate(async () => {
            window.State._rawData.wildcards = {};
            window.State._initProxy();

            window.State.state.wildcards.DeleteTest = { instruction: '', wildcards: ['exist'] };
            window.State.saveStateToHistory();
        });

        // Delete
        await page.evaluate(() => {
            delete window.State.state.wildcards.DeleteTest;
            window.State.saveStateToHistory();
        });

        let exists = await page.evaluate(() => !!window.State.state.wildcards.DeleteTest);
        expect(exists).toBe(false);

        await page.evaluate(() => window.State.undo());
        exists = await page.evaluate(() => !!window.State.state.wildcards.DeleteTest);
        expect(exists).toBe(true);
    });

    test('Mixed operations (Add, Rename, Delete) with Undo/Redo', async ({ page }) => {
        test.setTimeout(60000);

        await page.evaluate(async () => {
            window.State._rawData.wildcards = {};
            window.State._initProxy();
            // Start
            window.State.saveStateToHistory();
        });

        // 1. Add Category
        await page.evaluate(() => {
            window.State.state.wildcards.Cat1 = { instruction: '', wildcards: [] };
            window.State.saveStateToHistory();
        });

        // 2. Add Item
        await page.evaluate(() => {
            window.State.state.wildcards.Cat1.wildcards.push('Item1');
            window.State.saveStateToHistory();
        });

        // 3. Rename Item (Update)
        await page.evaluate(() => {
            window.State.state.wildcards.Cat1.wildcards[0] = 'Item1_Renamed';
            window.State.saveStateToHistory();
        });

        // 4. Delete Category
        await page.evaluate(() => {
            delete window.State.state.wildcards.Cat1;
            window.State.saveStateToHistory();
        });

        // Check Delete
        let hasCat = await page.evaluate(() => !!window.State.state.wildcards.Cat1);
        expect(hasCat).toBe(false);

        // Undo Delete (Back to 3)
        await page.evaluate(() => window.State.undo());
        hasCat = await page.evaluate(() => !!window.State.state.wildcards.Cat1);
        expect(hasCat).toBe(true);
        let item = await page.evaluate(() => window.State.state.wildcards.Cat1.wildcards[0]);
        expect(item).toBe('Item1_Renamed');

        // Undo Rename (Back to 2)
        await page.evaluate(() => window.State.undo());
        item = await page.evaluate(() => window.State.state.wildcards.Cat1.wildcards[0]);
        expect(item).toBe('Item1');

        // Undo Add Item (Back to 1)
        await page.evaluate(() => window.State.undo());
        let wcLength = await page.evaluate(() => window.State.state.wildcards.Cat1.wildcards.length);
        expect(wcLength).toBe(0);

        // Undo Add Category (Back to Start)
        await page.evaluate(() => window.State.undo());
        hasCat = await page.evaluate(() => !!window.State.state.wildcards.Cat1);
        expect(hasCat).toBe(false);

        // Redo All
        await page.evaluate(() => window.State.redo()); // Add Cat
        expect(await page.evaluate(() => !!window.State.state.wildcards.Cat1)).toBe(true);

        await page.evaluate(() => window.State.redo()); // Add Item
        expect(await page.evaluate(() => window.State.state.wildcards.Cat1.wildcards.length)).toBe(1);

        await page.evaluate(() => window.State.redo()); // Rename
        expect(await page.evaluate(() => window.State.state.wildcards.Cat1.wildcards[0])).toBe('Item1_Renamed');

        await page.evaluate(() => window.State.redo()); // Delete
        expect(await page.evaluate(() => !!window.State.state.wildcards.Cat1)).toBe(false);
    });

    test('processYamlNode handles instructions in comments', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const yamlText = `
TestKey:
  # instruction: Do this
  - Item 1
`;
            const YAML = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
            const doc = YAML.parseDocument(yamlText);

            return window.State.processYamlNode(doc.contents);
        });

        expect(result.TestKey.instruction).toBe('Do this');
        expect(result.TestKey.wildcards[0]).toBe('Item 1');
    });
});
