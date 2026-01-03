## 2024-05-23 - Initial Palette Session

**Learning:** This project generates UI via string interpolation in `js/ui.js` extensively.
**Action:** When fixing accessibility or UI polish, I must look at `js/ui.js` primarily, not just `index.html`.

## 2024-05-24 - Accessibility Fixes

**Learning:** Dynamic values in `aria-label` attributes within `js/ui.js` template strings must be sanitized using `sanitize()` to prevent XSS, just like HTML content.
**Action:** Always wrap variables in `sanitize()` when interpolating into HTML attributes.

## 2024-05-24 - Rapid Entry Pattern

**Learning:** For rapid data entry (e.g., adding multiple items to a list), merely preventing the default 'Enter' behavior isn't enough. Reactive UI updates (like adding an item to the state) often trigger re-renders that destroy and recreate DOM elements, causing focus loss.
**Action:** When implementing rapid entry, ensure that the UI update mechanism either (a) uses targeted updates that preserve the input element (as `updateCardContent` does here) or (b) explicitly re-focuses the input element after the update operation. In this case, `input.focus()` was added to `js/app.js` to ensure robustness even if timing is tight.
