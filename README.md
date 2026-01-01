# AI-Powered Wildcard Generator (Web Version)

A standalone Single Page Application (SPA) for managing and generating "wildcards" (dynamic lists of terms) for AI image generation prompts. Runs directly in your browser.

## Features

### Core
- **Hierarchical Organization** — Nested folders and categories
- **AI Generation** — Use LLMs (Gemini, OpenRouter, or OpenAI-compatible APIs) to expand lists
- **Import/Export** — YAML format, ZIP download with folder structure
- **Search** — Instant search with match highlighting
- **Undo/Redo** — Full history support

### v2.9+
- 🍞 **Toast Notifications** — Non-blocking status messages
- 📱 **PWA/Offline** — Works without internet after first load
- ⚡ **Lazy Loading** — Categories load on expand

### v2.10+
- 🌙/☀️ **Theme Toggle** — Dark/Light mode with persistence
- ⌨️ **Keyboard Navigation** — Arrow keys + Enter + Escape
- 🔍 **Duplicate Detection** — Find duplicates across categories
- 📌 **Favorites/Pinning** — Pin categories to top

### v2.11+
- 📊 **Statistics Dashboard** — Category/wildcard/pinned counts
- ✅ **Batch Operations** — Select and operate on multiple categories
- 🔆 **Search Highlighting** — Visual match highlighting

## Quick Start

1. **Open the App**
   Simply open `index.html` in your browser. No server or installation required.

2. **Setup API Key** (Required for AI features)
   - Click **Global Settings** (top of the page)
   - Select your preferred AI provider:
     - **OpenRouter** (Recommended - access to Claude, GPT-4, Llama 3, etc.)
     - **Gemini** (Google's models)
     - **Custom** (Any OpenAI-compatible API)
   - Enter your API Key. Keys are stored safely in **session memory only** and are never saved to files.

   > **Get an API Key:**
   > - [Get OpenRouter Key](https://openrouter.ai/keys)
   > - [Get Gemini Key](https://aistudio.google.com/app/apikey)

## Features

### Core
- **Hierarchical Organization** — Nested folders and categories
- **AI Generation** — Use LLMs to expand lists
- **Import/Export** — YAML format, ZIP download with folder structure
- **Search** — Instant search with match highlighting
- **Undo/Redo** — Full history support

### v2.11+
- 📊 **Statistics Dashboard** — Category/wildcard/pinned counts
- ✅ **Batch Operations** — Select and operate on multiple categories
- 🔆 **Search Highlighting** — Visual match highlighting
- 🔒 **Secure Settings** — Session-based API key management

## Development

Built with vanilla HTML, CSS, and JavaScript (ES Modules). Refactored into a modular architecture for better maintainability.

| File | Purpose |
|------|---------|
| `index.html` | Entry point |
| `js/app.js` | Main application logic & initialization |
| `js/ui.js` | UI rendering and event handling |
| `js/state.js` | State management (Proxy-based) |
| `js/api.js` | LLM API integration (Gemini/OpenRouter) |
| `wildcards.css` | Styling |
| `data/` | Default dataset |
| `tests/` | Playwright E2E tests |

### Testing

```bash
npm install -D @playwright/test http-server
npx playwright install chromium
npx playwright test
```

Current Status: **42/42 passed** (100% Core coverage)

## For Developers & AI Agents

See `AGENTS.md` for architecture rules and development workflows.

## Contributing

Feel free to open issues or submit pull requests.
