# Application Architecture

This document describes the architectural design of the Wildcard Generator application.

## Overview

The application is a **Single Page Application (SPA)** that runs entirely in the browser. It does not use any build tools (like Webpack or Vite) or backend servers. It relies on standard ES Modules and modern browser APIs.

## Core Modules

The application logic is modularized in the `js/` directory:

| Module | File | Responsibilities |
|--------|------|------------------|
| **Entry** | `main.js` | Initializes the app, sets up service workers, and conditionally exposes modules for testing. |
| **Logic** | `app.js` | The "controller" of the MVC pattern. Handles initialization, event delegation, and coordinates interactions between State, UI, and API. |
| **State** | `state.js` | Manages the application data using a deep Proxy pattern. It automatically persists state to localStorage, tracks history, and triggers granular UI updates via `deepDiff`. |
| **UI** | `ui.js` | Handles DOM manipulation and rendering. It receives data from the State module and renders the hierarchical category/wildcard structure. |
| **API** | `api.js` | Manages communication with LLM providers (OpenRouter, Gemini, Custom). Handles streaming responses, error parsing, and manages prompts for Wildcard, Suggestion, and Template generation. |
| **Config** | `config.js` | Manages configuration settings. Loads static defaults from `config/config.json` and handles user overrides (persisted to localStorage) for System, Suggestion, and Template prompts. |
| **Utils** | `utils.js` | Contains helper functions for debouncing, sanitizing strings, and other utility tasks. |

### Feature Modules (`js/modules/`)

| Module | File | Responsibilities |
|--------|------|------------------|
| **Drag & Drop** | `drag-drop.js` | Handles all drag-and-drop functionality for reordering categories and wildcards. |
| **Import/Export** | `import-export.js` | Manages file I/O operations for YAML, ZIP, and Settings JSON files. |
| **Mindmap** | `mindmap.js` | Provides interactive mindmap visualization. Manages Mind Elixir instance, bidirectional sync with State, smart context menus, and focus mode UI overlay. |
| **Settings** | `settings.js` | Handles API key verification and settings-related operations on startup. |

1.  **User Interaction**: The user interacts with the UI (clicks, typing, etc.).
2.  **Event Handling**: `app.js` catches these events via event delegation on the main container.
3.  **State Update**: `app.js` calls methods in `state.js` to modify the application data (e.g., updating a wildcard).
4.  **Reactivity**: The Proxy in `state.js` intercepts the modification, updates the internal data structure, and triggers a callback with the specific path of the change.
5.  **Rendering**: The UI module (`ui.js`) receives these updates. For Undo/Redo operations, `state.js` calculates a `deepDiff` between states and dispatches a batch of granular updates to avoid a full re-render.
6.  **Persistence**: `state.js` automatically saves the updated state to `localStorage`.

The application uses a **Deep Proxy** pattern to manage state. This allows for direct mutation of the state object while capturing every change.

- **`createDeepProxy`**: Wraps the data object and its nested objects recursively.
- **`path`**: The proxy keeps track of the path to the current property (e.g., `wildcards.Characters.wildcards.0`), allowing for precise updates.
- **`deepDiff`**: When navigating history (Undo/Redo), this helper calculates the minimal set of changes between two state snapshots.
- **`state-patch`**: A custom event used to deliver a batch of granular changes to the UI, improving performance from $O(n)$ to $O(m)$ where $m$ is the number of changes.

## UI Rendering

- **Granular Updates**: The UI responds to specific property changes (e.g., updating a single wildcard chip) rather than re-rendering entire categories whenever possible.
- **DOM Replacement**: For complex changes or top-level category updates, `ui.js` may replace the corresponding DOM element. Full re-renders (`renderAll`) are reserved for structural changes like pinning.
- **Animations**: Uses a specific DOM structure (`.accordion-wrapper` > `.accordion-inner`) to enable smooth CSS Grid-based transitions (`grid-template-rows`) for category expansion and collapse.
- **State Preservation**: To prevent the UI from resetting, `ui.js` preserves the `open` state of `<details>` elements.
- **Lazy Loading**: Categories are rendered with their content initially hidden or empty until expanded, improving performance for large datasets.
- **View Modes**: Supports **List**, **Mindmap**, and **Dual Pane** views. The Mindmap view renders the state using the Mind Elixir library and synchronizes structural changes (drag-and-drop, renaming) back to the core State via the `operation` event bus.

## CSS & Styling

- **Framework**: Tailwind CSS (via CDN) is used for utility classes.
- **Custom Styles**: `wildcards.css` contains custom styles for specific components like the tree view, loaders, and transitions.
- **Theming**: Dark/Light mode is supported via a toggle that adds/removes a `dark` class on the `html` element.

## External Dependencies

All dependencies are loaded via CDN in `index.html`:
- **Tailwind CSS**: Styling.
- **Mind Elixir**: Visualization library for Mindmap interaction.
- **YAML**: Parsing and stringifying YAML for import/export.
- **JSZip**: Creating ZIP archives for export.
