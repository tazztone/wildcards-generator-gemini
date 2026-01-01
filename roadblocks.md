# Roadblocks and Takeaways

## Session: Add Visual Separator for Drag and Drop

### Roadblocks Encountered

#### 1. Playwright Verification Challenges
*   **Timeout Errors:** We experienced timeouts when attempting to interact with modal inputs (`page.fill`) and buttons. This was often due to the script attempting interactions before the modal animation completed or the element was fully interactive in the DOM.
*   **Strict Mode Violations:** The recursive nature of the UI (categories inside categories) caused Playwright's "strict mode" to fail. Locators like `.add-wildcard-list-btn` matched multiple elements (one in the parent, one in the child).
    *   *Solution:* We had to refine locators to be more specific, using `data-parent-path` attributes (e.g., `div[data-parent-path='TestCat']`) to target the correct scope.
*   **Drag and Drop Simulation:** Simulating a drag operation to trigger the `dragging-active` class on the body was unreliable in the headless environment using standard `mouse.down/move` sequences. The logic in `app.js` relies on specific event sequences that were hard to replicate perfectly in the test script within the timeout limits.
*   **Visibility Assertions:** Assertions for the separator's visibility failed because the prerequisite state (`body.dragging-active`) was not successfully triggered by the simulated drag events.

#### 2. DOM State Management
*   **Element Replacement & State Loss:** The application's update logic (`handleStateUpdate` in `ui.js`) often replaces the entire DOM element for a category when its data changes. This causes transient state, such as the `open` attribute of `<details>` elements, to be lost.
*   *Impact:* Test scripts had to explicitly re-open categories after adding items to them, as the re-render collapsed them.

### Takeaways & Learnings

#### 1. Testing Strategies for Recursive UIs
*   **Specific Locators:** Always scope locators as narrowly as possible in a recursive UI. Attributes like `data-path` and `data-parent-path` are essential for distinguishing between identical components at different hierarchy levels.
*   **Manual State Mocking:** For verifying visual states that depend on complex user interactions (like Drag and Drop), it is often more reliable and efficient to manually trigger the state via JavaScript (e.g., `document.body.classList.add('dragging-active')`) rather than struggling to simulate the exact mouse gesture sequence. This verifies the *visual response* to the state, which is the primary goal of frontend verification.

#### 2. App Architecture Insights
*   **Re-render Behavior:** The "replace-on-update" pattern simplifies the rendering logic but has side effects on UX (losing folder expansion state). Future improvements could involve DOM diffing or manually restoring state after replacement.
*   **Global DnD State:** Using a class on `document.body` (`dragging-active`) is a robust way to manage global drag styles (like showing the separator), as it decouples the style trigger from specific element hovering.
