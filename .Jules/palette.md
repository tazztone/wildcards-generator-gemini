## 2024-05-23 - Accessibility in Dynamic Content
**Learning:** Dynamic content injection (like `innerHTML`) bypasses template accessibility checks if the strings are not carefully managed.
**Action:** When using string interpolation for UI components, ensure ARIA attributes are included directly in the template strings.
