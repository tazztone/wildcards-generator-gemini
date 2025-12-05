# AI-Powered Wildcard Generator (Web Version)

This is a standalone Single Page Application (SPA) for managing and generating "wildcards" (dynamic lists of terms) for AI image generation prompts. It runs directly in your browser.

## Features

*   **Hierarchical Organization:** Create nested folders and categories to organize your wildcards.
*   **AI Generation:** Use LLMs (Gemini, OpenRouter, or OpenAI-compatible APIs) to generate new wildcards based on your existing lists and custom instructions.
*   **Context-Aware:** The AI understands the category structure and existing items to avoid duplicates and maintain relevance.
*   **Import/Export:** Support for importing and exporting data in YAML format.
*   **Search:** Instant search across all your wildcard categories.
*   **Customizable:** Configure API keys, prompts, and UI settings.

## Getting Started

Simply open `index.html` in any modern web browser. No installation or server is required.

### Configuration

Click **Global Settings** in the interface to:
*   Enter your API keys (Gemini, OpenRouter, etc.).
*   Customize system prompts.
*   Adjust UI settings like search delay and history limits.

You can also use `api-keys.json` (rename `api-keys.json.example`) to preload keys.

## Development

The project is built with vanilla HTML, CSS, and JavaScript (ES Modules).

*   `index.html`: The main entry point.
*   `wildcards.js`: The application logic.
*   `wildcards.css`: The styling.
*   `data/`: Contains the default dataset (`initial-data.yaml`).

## Contributing

Feel free to open issues or submit pull requests to improve the tool.
