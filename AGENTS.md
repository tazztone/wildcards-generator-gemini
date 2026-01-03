# Instructions for AI Agents

This file contains context and rules for AI agents working on this repository.

## Core Directives

1.  **Follow the Architecture**: Read **[docs/architecture.md](docs/architecture.md)**. The project is a static SPA with **no build step**.
2.  **No Build Tools**: Do not introduce npm, webpack, vite, or any compilation step. Code must run natively in the browser.
3.  **Modular Logic**: JavaScript is split into modules in `js/`. Do not combine them into a single file.
4.  **Testing**: Always run tests before submitting. See **[tests/testing.md](tests/testing.md)**.

## Project Structure

├── index.html           # Entry point
├── js/                  # App modules (app.js, ui.js, state.js, etc.)
├── wildcards.css        # Custom Styling
├── config/              # Configuration directory
│   └── config.json      # Default settings
├── data/                # Default data
├── docs/                # Documentation
└── tests/               # Playwright tests

## API Keys & Security

- **Session Only**: API keys are stored in `sessionStorage` or memory variables. **Never** persist them to `localStorage` or disk.
- **Settings**: Users manage keys via the settings panel.

## Coding Standards

- **Event Delegation**: Use delegation on the main container in `js/app.js`. Avoid `event.stopPropagation()` on buttons unless absolutely necessary.
- **State Management**: Use `State` module methods. Do not mutate the DOM directly for state changes; let the `UI` react to state updates.
- **Formatting**: Keep code clean and readable.

## Documentation

When adding features or changing architecture, **update the relevant documentation** in `docs/` or `README.md`.
