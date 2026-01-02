## 2024-05-23 - Initial Palette Session

**Learning:** This project generates UI via string interpolation in `js/ui.js` extensively.
**Action:** When fixing accessibility or UI polish, I must look at `js/ui.js` primarily, not just `index.html`.

## 2024-05-24 - Accessibility Fixes

**Learning:** Dynamic values in `aria-label` attributes within `js/ui.js` template strings must be sanitized using `sanitize()` to prevent XSS, just like HTML content.
**Action:** Always wrap variables in `sanitize()` when interpolating into HTML attributes.
