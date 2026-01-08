# AI-Powered Wildcard Generator (Web Version)

A standalone Single Page Application (SPA) for managing and generating "wildcards" (dynamic lists of terms) for AI image generation prompts. Runs directly in your browser with a **Modern Glassmorphism UI** and **Smooth Animations**.

## Quick Start

1. **Run a Local Server**
   Because this app uses ES Modules and fetches local data files, modern browser security (CORS) requires it to be served via HTTP, not opened directly as a file.

   - **Node**: Run `npm run dev` (or `npx serve .`) and open `http://localhost:3000`.

2. **Setup API Key** (Required for AI features)
   - Click **Global Settings** (top of the page)
   - Select your preferred AI provider (OpenRouter, Gemini, or Custom).
   - Enter your API Key. Keys are stored in **session memory** by default, with an option to remember them (saved to local storage).

## Documentation

- **[Features](docs/features.md)**: Detailed list of features, including recent updates (v2.9 - v2.14).
- **[Architecture](docs/architecture.md)**: Technical overview of the code structure and design patterns.
- **[Testing](tests/testing.md)**: How to run and write tests.
- **[API Reference](docs/openrouter_API_docs.md)**: OpenRouter API documentation.

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for development guidelines.

## For AI Agents

See **[AGENTS.md](AGENTS.md)** for strict architectural rules and workflow instructions.
