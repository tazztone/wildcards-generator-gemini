# Instructions for AI Agents

This file contains context and rules for AI agents working on this repository.

## Project Architecture

| Aspect | Details |
|--------|---------|
| Type | Static Single Page Application (SPA) |
| Languages | HTML, CSS, JavaScript (ES Modules) |
| Entry Point | `index.html` |
| Logic | `wildcards.js` |
| Styling | `wildcards.css` + Tailwind CSS (CDN) |

## Core Rules

1. **No Build Step** — No webpack, vite, npm build. Code runs directly in browser.
2. **No Backend** — All logic is client-side JavaScript.
3. **Monolithic Structure** — Main files are `index.html`, `wildcards.js`, `wildcards.css`. Don't split into many small files.
4. **No Python** — Project was converted from Python to pure web app.

## Project Structure

```
├── index.html           # Entry point
├── wildcards.js         # App logic
├── wildcards.css        # Styling
├── manifest.json        # PWA manifest
├── sw.js                # Service worker for offline
├── config.json          # Default settings
├── data/
│   └── initial-data.yaml  # Default wildcard data
├── docs/
│   └── openrouter_API_docs.md
└── tests/
    └── e2e.spec.js      # Playwright tests
```

## API Keys

API keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`) are entered via the **Settings panel** in the browser. Keys are stored in session memory only and never persisted to disk or localStorage for security.

## Testing

Playwright E2E tests are available:

```bash
npm install -D @playwright/test http-server
npx playwright install chromium
npx playwright test
```

Current: **8 passed**, 1 skipped

## External Libraries (CDN)

- Tailwind CSS
- YAML (`yaml` library)
- JSZip (for ZIP export)

## Recent Features (v2.9-2.11)

- Toast notifications, PWA/offline, lazy loading
- Theme toggle, keyboard nav, duplicate detection, pinning
- Statistics dashboard, batch operations, search highlighting
