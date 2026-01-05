
const { test, expect } = require('@playwright/test');

test.describe('UX Improvements', () => {

  test.beforeEach(async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Go to the page
    await page.goto('/');

    // Reset state to ensure clean slate (clears localStorage)
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForSelector('#wildcard-container');

    // Add a new top level category to work in isolation
    await page.click('#add-category-placeholder-btn');

    // The notification dialog appears with an input
    await page.waitForSelector('#notification-dialog[open]');
    await page.fill('#notification-message input', 'UX Test Category'); // Unique name
    await page.click('#confirm-btn');

    // Wait for the new category to appear using data-path to be precise (underscores!)
    const category = page.locator('details[data-path="UX_Test_Category"]');
    await expect(category).toBeVisible();

    // Force open the category to ensure content is visible
    await category.evaluate(el => /** @type {HTMLDetailsElement} */(el).open = true);

    // Inside the category, click add wildcard list
    const addWildcardBtn = category.locator('.add-wildcard-list-btn');
    await expect(addWildcardBtn).toBeVisible();
    await addWildcardBtn.click();

    // Notification dialog appears again
    await page.waitForSelector('#notification-dialog[open]');
    await page.fill('#notification-message input', 'UX Test List');
    await page.click('#confirm-btn');

    // Wait for dialog to close
    await expect(page.locator('#notification-dialog')).toBeHidden();

    // Wait for the new card specifically (underscores for data-path)
    const newCard = page.locator('.wildcard-card[data-path="UX_Test_Category/UX_Test_List"]');
    await expect(newCard).toBeVisible({ timeout: 10000 });
  });

  test('Empty wildcard list should show empty state message', async ({ page }) => {
    // Target the specific card
    const card = page.locator('.wildcard-card[data-path="UX_Test_Category/UX_Test_List"]');
    const chipContainer = card.locator('.chip-container');

    // Initially empty
    await expect(chipContainer).toContainText('No items yet');

    // Add an item
    const input = card.locator('.add-wildcard-input');
    await input.fill('Test Item');
    await card.locator('.add-wildcard-btn').click();

    // Should now contain the item
    await expect(chipContainer).not.toContainText('No items yet');
    await expect(chipContainer).toContainText('Test Item');

    // Select the item and delete
    await card.locator('.batch-select').check();
    await card.locator('.batch-delete-btn').click();

    // Should show empty state again
    await expect(chipContainer).toContainText('No items yet');
  });

  test('Copy button should provide visual feedback', async ({ page }) => {
    const card = page.locator('.wildcard-card[data-path="UX_Test_Category/UX_Test_List"]');
    const copyBtn = card.locator('.copy-btn');

    // Add an item so there's something to copy
    await card.locator('.add-wildcard-input').fill('Item 1');
    await card.locator('.add-wildcard-btn').click();

    // Click copy
    await copyBtn.click();

    // Check for success state
    // We expect the button to change style or title
    await expect(copyBtn).toHaveAttribute('title', 'Copied!');
    // Also check for the icon or class change if possible, but title is a good start for a11y/UX
    await expect(copyBtn).toHaveClass(/text-green-400/);

    // Wait for reversion
    await page.waitForTimeout(2100);
    await expect(copyBtn).toHaveAttribute('title', 'Copy all wildcards');
    await expect(copyBtn).not.toHaveClass(/text-green-400/);
  });

  test.describe('Hover-Only Action Visibility', () => {
    test('pin button exists on category header', async ({ page }) => {
      const category = page.locator('details[data-path="UX_Test_Category"]');
      const pinBtn = category.locator('.pin-btn');

      // Pin button should exist in DOM
      await expect(pinBtn).toBeAttached();
    });

    test('delete button exists on category header', async ({ page }) => {
      const category = page.locator('details[data-path="UX_Test_Category"]');
      const deleteBtn = category.locator('.delete-btn').first();

      // Delete button should exist in DOM
      await expect(deleteBtn).toBeAttached();
    });

    test('pin button is clickable', async ({ page }) => {
      const category = page.locator('details[data-path="UX_Test_Category"]');
      const pinBtn = category.locator('.pin-btn');

      // Hover first to make button visible, then click
      await category.locator('summary').hover();
      await page.waitForTimeout(100);

      // Click should succeed without error
      await pinBtn.click({ force: true });

      // Wait a moment for any side effects
      await page.waitForTimeout(300);

      // Just verify no error was thrown - button was clickable
    });

  });

  test.describe('Wildcard Card Actions', () => {
    test('wildcard card has copy button', async ({ page }) => {
      const card = page.locator('.wildcard-card[data-path="UX_Test_Category/UX_Test_List"]');
      const copyBtn = card.locator('.copy-btn');

      await expect(copyBtn).toBeAttached();
    });

    test('wildcard card has delete button', async ({ page }) => {
      const card = page.locator('.wildcard-card[data-path="UX_Test_Category/UX_Test_List"]');
      const deleteBtn = card.locator('.delete-btn');

      await expect(deleteBtn).toBeAttached();
    });
  });
});

