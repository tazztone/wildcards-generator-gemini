
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
    await category.evaluate(el => el.open = true);

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
});
