# Testing Documentation

This document describes the testing strategy and framework for the Wildcard Generator application.

## Overview

| Aspect | Details |
|--------|---------|
| Framework | Playwright |
| Test Type | End-to-End (E2E) & Unit/Integration Logic |
| Browsers | Chromium |
| Test Location | `tests/` |
| **Total Tests** | **150** |
| **Status** | **Passed** ✅ |

## Quick Start

```bash
# Install dependencies
npm install -D @playwright/test http-server
npx playwright install chromium

# Run all tests
npx playwright test

# Run with visible browser
npx playwright test --headed

# Run specific test
npx playwright test -g "page loads"

# View HTML report
npx playwright test --show-report

# Re-run only failing tests (saves time!)
npx playwright test --last-failed

# Debug Mode (opens inspector)
npx playwright test --debug
```

## Test Files

- `tests/e2e.spec.js`: Comprehensive core functionality tests (UI, Categories, Wildcards, Batch Ops).
- `tests/e2e-new-features.spec.js`: Toolbar dropdown tests.
- `tests/bug_repro.spec.js`: Regression tests for complex scenarios (e.g., nested renaming).
- `tests/bug-fixes.spec.js`: General bug fix verification (Category addition, UI interactions).
- `tests/extended_coverage.spec.js`: Advanced scenarios like API Error Handling, Drag & Drop, Import/Export content verification.
- `tests/state_logic.spec.js`: Unit/Integration tests for `js/state.js` (Proxy, Undo/Redo, YAML).
- `tests/ui_logic.spec.js`: Logic tests for UI rendering rules (Sorting, Hiding instructions).
- `tests/utils.spec.js`: Unit tests for utility functions (`sanitize`, `debounce`).
- `tests/api_logic.spec.js`: Unit/Integration tests for `js/api.js` (Provider logic, Request/Response).
- `tests/dnd_logic.spec.js`: Logic tests for Drag & Drop state mutations and rejection rules.
- `tests/state_proxy.spec.js`: Deep proxy update verification and YAML scalar edge cases.
- `tests/search_logic.spec.js`: Verifies search filtering and recursive visibility checks.
- `tests/config_merging.spec.js`: Logic for merging user settings with global Config.
- `tests/duplicate_detection.spec.js`: Logic for detecting and managing duplicate wildcards.
- `tests/breadcrumbs_focus.spec.js`: Focus management and auto-expansion for breadcrumb navigation.
- `tests/pinned_sort.spec.js`: Sorting logic for pinned vs unpinned categories.
- `tests/tinting.spec.js`: Category color tinting based on depth and index.
- `tests/ui_ux.spec.js`: UX improvements like empty state messages, feedback, and hover actions.
- `tests/settings_persistence.spec.js`: **NEW** - Model name, provider, and prompt persistence across sessions.
- `tests/double_click_edit.spec.js`: **NEW** - Double-click editing for category names and instructions.
- `tests/import_export_flows.spec.js`: **NEW** - Import/export workflows for YAML and settings files.
- `tests/test_model.spec.js`: **NEW** - Test connection button and model list functionality.
- `tests/suggest_dialog.spec.js`: **NEW** - Suggest popup structure and button placement.

## Test Categories

### 1. Core UI
- Page loading and title
- Search input functionality
- Undo/redo buttons visible
- Export buttons present
- Help dialog opens

### 2. Category Operations
- Category expands on click
- Category collapses when clicked again
- Pin button toggles pinning
- Add category shows dialog
- Delete button shows confirmation
- **Nested Category Renaming** (Bug Fix Verified)

### 3. Wildcard Management
- Copy button shows toast
- Add wildcard input works
- Generate more button exists
- Select all/deselect all toggles

### 4. Batch Operations
- Batch operations bar visible
- Select all checkbox enables buttons
- Batch expand works
- Batch collapse works

### 5. Theme & Settings
- Theme toggle visible
- Theme toggle switches modes
- Global settings panel toggles
- API dropdown has options
- Switching API shows different panel

### 6. Search & Statistics
- Statistics dashboard shows counts
- Search shows result count
- Check duplicates works
- Clear search resets view

### 7. Import/Export
- YAML export triggers download
- ZIP export triggers download
- Config export triggers download
- Import YAML button functional
- Import config button functional
- **Export Content Verification**: Checks if exported YAML actually contains data.

### 8. Keyboard Shortcuts
- Ctrl+S shows auto-save message
- Ctrl+Z triggers undo
- Escape collapses all categories
- Arrow keys navigate categories

### 9. Dialogs & Popups
- Notification dialog closes
- Suggest popup elements exist
- Generate popup elements exist

### 10. Accessibility
- ARIA live region exists
- Toast container has aria-live
- Dialogs have proper roles

### 11. Error Handling (New)
- API 500 Error triggers notification
- Network Error triggers notification

### 12. State Logic (New)
- Deep Proxy updates state on nested changes.
- Undo/Redo correctly restores previous states.
- Deletion is undoable.
- YAML processing correctly extracts instructions from comments.

### 13. UI Logic (New)
- Pinned categories sort before unpinned.
- 'instruction' keys are hidden from the UI but persist in data.

### 14. Utilities (New)
- `sanitize` escapes HTML.
- `debounce` delays function execution.

### 15. API Logic (New)
- Request preparation for Gemini, OpenRouter, and Custom APIs.
- Response parsing handling different JSON/Markdown formats.
- Error handling for failed connections.

### 16. Drag & Drop Logic (New)
- Verifies `moveItem` correctly updates state structure.
- Prevents invalid moves (e.g., parent into child).
- Respects data types (cannot drop item inside a wildcard list).

### 17. State Proxy Logic (New)
- Verifies deep proxy traps for nested updates.
- Verifies YAML processing robustness (handling null scalars).

## Configuration

Test config in `playwright.config.js`:

```javascript
module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npx http-server . -p 8080 -c-1',
        url: 'http://localhost:8080',
        reuseExistingServer: !process.env.CI,
    },
});
```

## CI/CD Integration

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npx playwright test
```

## Troubleshooting

| Issue | Solution |
|-------|----------|

| Tests timeout | Increase timeout, check network |
| Elements not found | Add explicit waits, check selectors |
| Server not starting | Verify port 8080 is available |
| Execution context destroyed | Avoid page navigation during `page.evaluate`, use `_rawData` manipulation instead of `resetState` if it triggers reloads/async chaos. |

## Known Limitations & Challenges

### 1. Playwright Verification
*   **Timeout Errors:** Modal inputs and buttons can cause timeouts if interactions occur before animations complete.
*   **Strict Mode Violations:** Recursive UIs (categories inside categories) can cause "strict mode" failures. Use specific locators with `data-parent-path` to distinguish elements.
*   **Drag and Drop:** Simulating drag events to trigger global states (like `body.dragging-active`) is unreliable with standard mouse events.
*   **Visibility Assertions:** Prerequisite states for visibility checks often require precise timing or manual event triggering.

### 2. DOM State Management
*   **Element Replacement:** The app's `replace-on-update` logic destroys local state (like `<details open>`) when data changes. Test scripts must account for this by re-opening categories after updates.

## Testing Best Practices

### Strategies for Recursive UIs
*   **Specific Locators:** Use `data-path` and `data-parent-path` attributes to target the correct scope in recursive structures.
*   **Manual State Mocking:** For complex interactions like Drag & Drop visuals, manually triggering state classes (e.g., `document.body.classList.add('dragging-active')`) is often more reliable than simulating mouse gestures.

### Architecture Insights
*   **Global State:** Using global classes on `body` is robust for app-wide modes like dragging.
*   **Granular Updates:** The app recently shifted from full-element replacement on every update to granular updates via `state-patch` and `deepDiff`. This significantly improves test reliability as DOM elements (and their local state like `<details open>`) are preserved during standard undo/redo operations.
*   **Re-rendering:** Be aware that while `state-patch` handles most updates, some operations (like pining or batch deletions) may still trigger a full `renderAll()`.
*   **Exposing Modules for Testing:** To test internal logic of modules (State, UI), we expose them to `window` in `main.js` when running locally, allowing `page.evaluate` to access them.

## Key Takeaways from Recent Improvements

*   **Wait for Globals:** When testing exposed modules via `page.evaluate`, always use `await page.waitForFunction(() => typeof window.Module !== 'undefined')` to ensure initialization is complete before access.
*   **Test Data Validity:** When testing logic that depends on data structure (like Drag & Drop rejection rules), ensure your test setup perfectly matches the expected structure (e.g., Categories must not have a `wildcards` array if they are folders).
*   **Robust YAML Processing:** When processing YAML, always check for `null` values explicitly, as `typeof null` is `'object'`, which can cause runtime errors if property access is attempted.
*   **Event Handling in Tests:** For interactions like Search `input` events, standard `page.fill` might sometimes race with event listener attachment in parallel execution. Using `page.waitForFunction` to ensure UI initialization or forcing event dispatch can improve reliability.
*   **Diff-Based Stability:** Using `State.undo()`/`redo()` in tests is now safer because it uses granular patches. However, always verify that the expected DOM element is still present or has been updated correctly after a state patch.

## Best Practices & Learnings

### Handling Hover States and Visibility
- **Visibility vs. Attachment:** `toBeVisible()` waits for an element to be both in the DOM *and* visually perceptible (opacity > 0, visibility: visible). For elements that only appear on hover (like pin/delete buttons), use `toBeAttached()` if you just want to verify existence in the DOM, or ensure you programmatically trigger the hover state first before asserting visibility.
  ```javascript
  // Trigger hover then check visibility
  await element.hover();
  await expect(childButton).toBeVisible(); 
  
  // Or just check DOM presence (less flaky)
  await expect(childButton).toBeAttached();
  ```

### State Management
- **LocalStorage:** Tests share the same browser context storage unless explicitly cleared. Always clear `localStorage` in `beforeEach` for tests that modify settings or data to ensuring isolation.
  ```javascript
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });
  ```

### Mocking API Calls
- **Avoid Real Requests:** For features like "Suggest" or "Test Model", mock the API response using `page.route()`. This makes tests faster and deterministic and avoids API rate limits or costs.
  ```javascript
  await page.route('**/chat/completions', route => route.fulfill({
      status: 200,
      body: JSON.stringify({ ... })
  }));
  ```

### Selectors
- **Stability:** Use stable attributes like `id` or `data-path` over loose text matching.
- **Dynamic Content:** For generated content (like wildcards), relying on the specific `data-path` structure (e.g., `Category/List`) is more robust than CSS structure selectors like `div > div > button`.
