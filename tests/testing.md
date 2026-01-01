# Testing Documentation

This document describes the testing strategy and framework for the Wildcard Generator application.

## Overview

| Aspect | Details |
|--------|---------|
| Framework | Playwright |
| Test Type | End-to-End (E2E) & Unit/Integration Logic |
| Browsers | Chromium |
| Test Location | `tests/` |
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
npx playwright show-report
```

## Test Files

- `tests/e2e.spec.js`: Core functionality tests (UI, Categories, Wildcards, Batch Ops).
- `tests/e2e-new-features.spec.js`: Newer features like API Settings, Theme Toggle, Toolbar.
- `tests/bug_repro.spec.js`: Regression tests ensuring reported bugs (e.g., nested renaming) are fixed.
- `tests/extended_coverage.spec.js`: Advanced scenarios like API Error Handling, Drag & Drop (wip), Import/Export content verification.
- `tests/state_logic.spec.js`: **NEW** - Unit/Integration tests for `js/state.js` logic (Deep Proxy, Undo/Redo, YAML processing).
- `tests/ui_logic.spec.js`: **NEW** - Logic tests for UI rendering rules (Sorting, Hiding instructions).
- `tests/utils.spec.js`: **NEW** - Unit tests for utility functions (`sanitize`, `debounce`).

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

## Configuration

Test config in `playwright.config.js`:

```javascript
module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    use: {
        baseURL: 'http://localhost:8080',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
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
*   **Re-rendering:** Be aware that the current full-element replacement strategy affects UX and testing state persistence.
*   **Exposing Modules for Testing:** To test internal logic of modules (State, UI), we expose them to `window` in `main.js` when running locally, allowing `page.evaluate` to access them.
