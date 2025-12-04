# AI-Powered Wildcard Generator

This repository contains a tool for managing and generating "wildcards" (dynamic lists of terms) for AI image generation prompts. It allows you to organize wildcards into nested categories and use AI (Google Gemini, OpenRouter, or OpenAI-compatible APIs) to generate new, creative additions to your lists.

The project includes two versions of the tool:
1.  **Web Version (HTML/JS):** A feature-rich, single-page application that runs directly in your browser.
2.  **Python Version (Gradio):** A local server-based version offering a different interface and direct file system integration.

## Features

*   **Hierarchical Organization:** Create nested folders and categories to organize your wildcards.
*   **AI Generation:** Use LLMs (Gemini, GPT-4, Claude, etc.) to generate new wildcards based on your existing lists and custom instructions.
*   **Context-Aware:** The AI understands the category structure and existing items to avoid duplicates and maintain relevance.
*   **Import/Export:** Support for importing and exporting data in YAML format.
*   **Search:** Instant search across all your wildcard categories.
*   **Customizable:** Configure API keys, prompts, and UI settings.

## Project Structure

*   `app.py`: Python application entry point.
*   `web/`: Contains the Web Version files (`wildcards.html`, `wildcards.js`, `wildcards.css`) and configuration.
    *   `web/data/`: Contains data files (`initial-data.yaml`).
*   `scripts/`: Installation scripts.
*   `docs/`: Documentation.

---

## 1. Web Version (Recommended)

The Web Version is a standalone Single Page Application (SPA). It offers the most complete feature set, including drag-and-drop organization, advanced AI suggestions, and support for multiple API providers.

### How to Run
Simply open the `web/wildcards.html` file in any modern web browser. No installation is required.

### Key Features
*   **Multiple API Support:** connect to Google Gemini, OpenRouter, or any custom OpenAI-compatible endpoint.
*   **Drag & Drop:** Reorganize categories and items easily.
*   **LocalStorage:** Your data is saved automatically in your browser's local storage.
*   **Rich UI:** Dark mode interface with collapsible categories and tag-based editing.

### Configuration
Click "Global Settings" in the interface to:
*   Enter your API keys (Gemini, OpenRouter, etc.).
*   Customize system prompts.
*   Adjust UI settings like search delay and history limits.

You can also use `web/api-keys.json` (rename `web/api-keys.json.example`) to preload keys.

---

## 2. Python Version (Gradio Port)

The Python version runs a local web server using Gradio. It interacts directly with the local file system to read and write YAML files.

### Prerequisites
*   Python 3.8 or higher installed.

### Installation

1.  Clone this repository or download the files.
2.  Run the installation script:
    *   **Windows:** Double-click `scripts/windows_install.bat`.
    *   **Linux/macOS:** Run `scripts/install.sh`.
    *   **Manual:**
        ```bash
        python -m venv venv
        source venv/bin/activate  # On Windows: venv\Scripts\activate
        pip install -r requirements.txt
        ```

### How to Run

1.  Activate the virtual environment (if not already active).
2.  Run the application:
    ```bash
    python app.py
    ```
3.  Open the URL displayed in the terminal (usually `http://127.0.0.1:7860`) in your browser.

### Features
*   **Direct File Access:** Reads and writes directly to `web/data/initial-data.yaml` (or imported YAMLs).
*   **Multiple API Support:** Supports Google Gemini, OpenRouter, and Custom OpenAI-compatible APIs.
*   **Category Management:** Create and delete categories directly from the interface.
*   **Persistence:** Save changes directly to disk.

---

## Configuration Files

*   **`web/config.json`**: Contains default settings for the application. You can modify this file to change default prompts or storage keys.
*   **`web/api-keys.json`**: (Optional) You can create this file to preload API keys for the Web Version. See `web/api-keys.json.example` for the format.
*   **`web/data/initial-data.yaml`**: The default dataset loaded when resetting the application or starting fresh.

## Usage Guide

### Managing Categories
*   **Create:** Use the "+" button to add new folders or wildcard lists.
*   **Edit:** Click on any category name or wildcard to rename it inline.
*   **Delete:** Use the "x" or trash icon to remove items.

### Generating Wildcards
1.  Select a category or open a wildcard card.
2.  (Optional) Enter custom instructions in the input field (e.g., "Focus on sci-fi themes").
3.  Click **Generate More**.
4.  The AI will analyze your existing items and category path to suggest new, unique additions.
5.  Review and select the generated items to add them to your list.

### Import / Export
*   **Export:** Save your entire collection as a YAML file to back it up or share it.
*   **Import:** Load a YAML file to restore your collection. *Warning: This overwrites current data.*

## Contributing
Feel free to open issues or submit pull requests to improve either the Web or Python versions of the tool.
