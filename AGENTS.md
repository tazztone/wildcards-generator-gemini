# Instructions for AI Agents

This file contains context and rules for AI agents working on this repository.

## Project Architecture

| Aspect | Details |
|--------|---------|
| Type | Static Single Page Application (SPA) |
| Languages | HTML, CSS, JavaScript (ES Modules) |
| Entry Point | `index.html` |
| Logic | `js/app.js` (Modular) |
| Styling | `wildcards.css` + Tailwind CSS (CDN) |

## Core Rules

1. **No Build Step** — No webpack, vite, npm build. Code runs directly in browser.
2. **No Backend** — All logic is client-side JavaScript.
3. **Modular Structure** — Main entry is `index.html`. Logic is split into modules in `js/`. `wildcards.js` has been removed.
4. **No Python** — Project was converted from Python to pure web app.

## Project Structure

├── index.html           # Entry point
├── js/                  # App modules
│   ├── app.js           # Main logic
│   ├── ui.js            # UI rendering
│   ├── state.js         # State management
│   ├── api.js           # LLM integration
│   └── ...
├── wildcards.css        # Styling
├── manifest.json        # PWA manifest
├── sw.js                # Service worker for offline
├── config.json          # Default settings
├── data/
│   └── initial-data.yaml  # Default wildcard data
├── docs/
│   └── openrouter_API_docs.md
└── tests/
    ├── e2e.spec.js              # Core E2E tests
    ├── e2e-new-features.spec.js # Feature-specific E2E tests
    ├── bug_repro.spec.js        # Regression tests for fixed bugs
    └── extended_coverage.spec.js# Coverage for API errors, Import/Export, etc.

## API Keys

API keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`) are entered via the **Settings panel** in the browser. Keys are stored in session memory only and never persisted to disk or localStorage for security.

## Testing

Playwright E2E tests are available:

```bash
npm install -D @playwright/test http-server
npx playwright install chromium
npx playwright test
```

See [tests/testing.md](tests/testing.md) for detailed testing documentation.

## External Libraries (CDN)

- Tailwind CSS
- YAML (`yaml` library)
- JSZip (for ZIP export)

## Recent Features (v2.9-2.11)

- Toast notifications, PWA/offline, lazy loading
- Theme toggle, keyboard nav, duplicate detection, pinning
- Statistics dashboard, batch operations, search highlighting

## Coding Standards

### Event Delegation
- The application uses event delegation on the main container (`js/app.js`).
- **DO NOT** use `event.stopPropagation()` on action buttons (like Pin/Delete), as it breaks the delegation.
- Allow events to bubble and handle them in `js/app.js`.
