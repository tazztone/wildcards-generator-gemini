# Instructions for AI Agents

This file contains context and rules for AI agents working on this repository.

## 📌 Project Overview
**Wildcards Generator** is a client-side SPA for managing and generating dynamic prompt lists ("wildcards") for AI image generation. It features a hierarchical list view, a mindmap visualization, and LLM-powered generation.

## 🛠️ Technology Stack
*   **Core**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
*   **No Build Step**: Works directly in the browser. No Webpack/Vite/Babel.
*   **Styling**: Tailwind CSS (CDN) + `wildcards.css` (Custom/Component styles).
*   **Libraries (Global Scope)**:
    *   `mind-elixir` (Mindmap visualization)
    *   `YAML` (Data parsing)
    *   `JSZip` (Export)
*   **Testing**: Playwright (`tests/`)

## ⚡ Core Directives

1.  **No Build Tools**: **NEVER** introduce a build step or npm-only dependencies that require bundling. Use CDNs in `index.html` if a library is absolutely needed.
2.  **Type Safety**: The project uses JSDoc for checks. See `jsconfig.json`. Fix type errors if you cause them.
3.  **Event Delegation**: Use delegation on the main container in `app.js`. Avoid `event.stopPropagation()` unless absolutely necessary.
4.  **Modular Logic**: Keep concerns separated in `js/`.
    *   `app.js`: Orchestrator & Event Delegation.
    *   `state.js`: Data management & Deep Proxy.
    *   `ui.js`: DOM rendering & updates.
    *   `mindmap.js`: Mind Elixir integration.
5.  **Testing**: Run tests to verify changes:
    *   `npm test` (Runs all Playwright tests)
    *   `npm run dev` (Starts local server)

## 📂 Project Structure

```text
├── index.html           # Entry point (CDNs, Layout)
├── wildcards.css        # Custom component styling
├── js/                  # ES Modules
│   ├── app.js           # Main controller
│   ├── state.js         # Reactive state (Proxy)
│   ├── ui.js            # DOM manipulation
│   ├── modules/         # Feature modules (mindmap, drag-drop)
├── config/              # Default configuration
├── data/                # Initial wildcard data (YAML)
├── tests/               # Playwright E2E tests
└── docs/                # Architecture & guides
```

## 💾 Data & State Patterns

*   **YAML Comments & Parsing**:
    The `data/initial-data.yaml` uses a **comment-based instruction format**.
    ```yaml
    Category_Name: # instruction: Description of the category
       - wildcard1
    ```
    > **IMPORTANT**: Use `YAML.parseDocument()` + `State.processYamlNode()` to preserve these. Simple `YAML.parse()` will lose them!

*   **State Proxy Pattern**:
    Mutate `State.wildcards` directly. The "Deep Proxy" in `state.js` triggers UI updates via `deepDiff`.
    *   **Rule**: Do NOT manually manipulate the DOM for data changes (e.g. adding a list item). Let the `UI` react.
    *   **Exception**: You MAY manipulate DOM for transient generic UI states (e.g. toggling a detail open/close) to avoid expensive re-renders.

## 🔑 Security & API
*   **Session Storage**: API keys are stored in `sessionStorage` or memory only.
*   **No Hardcoding**: Never put keys in code.
*   **Settings**: managed via `config.js` and the settings panel.

## 📚 Documentation
*   Read `docs/architecture.md` for architectural deep dives.
*   Update `README.md` if features change.
