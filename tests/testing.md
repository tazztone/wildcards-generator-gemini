# Testing Documentation

This document describes the testing strategy and framework for the Wildcard Generator application.

## Overview

| Aspect | Details |
|--------|---------|
| Framework | Playwright |
| Test Type | End-to-End (E2E) |
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
