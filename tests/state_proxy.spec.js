import { test, expect } from '@playwright/test';

test.describe('State Proxy & YAML Logic', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => typeof window.State !== 'undefined');
    });

    test('should handle deep nested updates via proxy', async ({ page }) => {
        await page.evaluate(() => {
            window.State.state.wildcards = {
                'Deep': {
                    'Nested': {
                        'Item': { wildcards: [] }
                    }
                }
            };
        });

        // Trigger update
        await page.evaluate(() => {
            window.State.state.wildcards.Deep.Nested.Item.wildcards.push('test');
        });

        const result = await page.evaluate(() => window.State.state.wildcards.Deep.Nested.Item.wildcards[0]);
        expect(result).toBe('test');
    });

    test('should sort wildcards array automatically via proxy', async ({ page }) => {
        await page.evaluate(() => {
            window.State.state.wildcards = {
                'SortTest': { wildcards: ['b', 'a', 'c'] }
            };
        });

        // Proxy trap sorts on modification?
        // Wait, the trap in State.js sorts ONLY if modification happens.
        // Initial set of `wildcards` array via object replacement might not trigger sort of the array content if it was passed as whole.
        // But let's check if pushing triggers sort.

        await page.evaluate(() => {
            window.State.state.wildcards.SortTest.wildcards.push('d');
        });

        const result = await page.evaluate(() => window.State.state.wildcards.SortTest.wildcards);
        expect(result).toEqual(['a', 'b', 'c', 'd']);
    });

    test('processYamlNode should handle various comment formats for instructions', async ({ page }) => {
        // We test the internal function
        const result = await page.evaluate(async () => {
             // We need to use YAML library which is loaded in State.js
             // But processYamlNode expects a node from YAML.parseDocument
             // Since we can't easily import node_modules in page.evaluate without build step,
             // we stick to the CDN used by the app to ensure environment consistency.
             const yaml = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;

             const yamlText = `
Key1:
  # instruction: Do something
  - item1
Key2:
  # instruction: Another thing
  SubKey:
    - item2
             `;
             const doc = yaml.parseDocument(yamlText);
             return window.State.processYamlNode(doc.contents);
        });

        expect(result.Key1.instruction).toBe('Do something');
        expect(result.Key2.SubKey.instruction).toBe(''); // No instruction on SubKey, but parent had one?
        // Wait, instruction is on valueNode.
        // Key2 has comment. But Key2 is a map.
        // processYamlNode extracts instruction from pair.value comment.
        // So Key2 should have instruction.
        expect(result.Key2.instruction).toBe('Another thing');
    });

    test('processYamlNode should handle weird scalar values', async ({ page }) => {
        const result = await page.evaluate(async () => {
             const yaml = (await import('https://cdn.jsdelivr.net/npm/yaml@2.8.2/browser/index.js')).default;
             const yamlText = `
NumberKey: 123
BoolKey: true
NullKey: null
             `;
             const doc = yaml.parseDocument(yamlText);
             return window.State.processYamlNode(doc.contents);
        });

        expect(result.NumberKey.wildcards[0]).toBe('123'); // Converted to string
        expect(result.BoolKey.wildcards[0]).toBe('true');
        // Null usually becomes empty object or skipped?
        // Implementation:
        // if (YAML.isScalar(node)) return node.value;
        // else return {}
        // Then:
        // result[key] = { wildcards: [String(processedValue)] }
        // null value is null. String(null) is "null".
        expect(result.NullKey.wildcards[0]).toBe('null');
    });

});
