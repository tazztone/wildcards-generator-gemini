# Features

This document details the features of the Wildcard Generator application.

## Core Functionality

### Hierarchical Organization
- **Nested Categories**: Create unlimited levels of folders and subfolders to organize your wildcards.
- **Drag & Drop**: Reorder items or move them between categories using drag and drop (WIP).

### AI Generation
- **LLM Integration**: Connect to powerful AI models via OpenRouter, Google Gemini, or any OpenAI-compatible API.
- **Context-Aware**: The AI understands the context of the folder structure to generate relevant items.
- **Custom Instructions**: Add specific instructions to categories or wildcard lists to guide the generation (e.g., "fantasy style", "sci-fi names").

### Wildcard Management
- **Manual Editing**: Add, edit, or delete wildcard items manually.
- **Batch Operations**: Select multiple items or categories to delete or move them in bulk.
- **Search**: Instantly search through all your wildcards with match highlighting.

## Advanced Features

### v2.13 Features (Latest)

- **Enhanced Safety**:
  - **Double-Click Edit**: Category and wildcard names (and instructions) now require a double-click to edit.
  - **Edit Indicators**: Pencil icons appear on hover to clearly indicate editable fields.
  - **Toggle Protection**: Editing a name no longer toggles the category open/closed.
- **Improved Settings UX**:
  - **Save & Close**: Explicit options to Save, Discard, or Cancel when closing settings with unsaved changes.
  - **Modal Toasts**: Notifications now appear above dialogs for better visibility.
- **Advanced API Tools**:
  - **Streaming Generation**: Watch the AI generate wildcards character-by-character with a live elapsed timer.
  - **Test Model Dialog**: Detailed modal showing full JSON response, response time, and validation checks for the selected model.
- **High-Performance Undo/Redo**:
  - **Diff-Based Updates**: Only changed UI elements are re-rendered, making undo/redo instantaneous even with thousands of wildcards.
  - **Granular Patches**: Uses a custom `deepDiff` algorithm to apply minimal DOM updates.
- **Visual Refinements**: Fixed light theme contrast issues and improved spacing.

### v2.12 Features

- **Import YAML/Config**: Fully functional import buttons for YAML wildcards and JSON config files.
- **Reset Options**: Multiple reset actions in the overflow menu:
  - Clear Local Storage (removes saved settings)
  - Clear Session Storage (removes temporary API keys)
  - Reset to Defaults (full app reset)
  - Reload Default Data (refresh from source without clearing settings)
- **Enhanced Duplicate Detection**:
  - Visual highlighting with pulsing amber indicators
  - Filter view to show only duplicate-containing cards
  - Clear highlights action
- **Improved Help Dialog**: Structured help with sections, keyboard shortcuts table, and tips.
- **API Test Model Button**: Test your selected model with a quick JSON request to verify response times and compatibility.

### v2.11 Features

- **Statistics Dashboard**: View real-time counts of categories, wildcards, and pinned items.
- **Batch Operations**:
    - **Select All**: Select all categories or items in a list.
    - **Bulk Actions**: Expand, collapse, or delete multiple selected categories at once.
- **Search Highlighting**: Search terms are visually highlighted in the results for easier scanning.
- **Secure Settings**: API keys and sensitive settings are stored in session memory only, ensuring they are not persisted to disk or exposed.

### v2.10 Features

- **Theme Toggle**: Switch between Dark and Light modes. Your preference is saved.
- **Keyboard Navigation**: Use Arrow keys to navigate, Enter to expand/collapse, and Escape to close folders.
- **Duplicate Detection**: Identify and highlight duplicate entries across your wildcard lists.
- **Favorites/Pinning**: Pin frequently used categories to the top of the list for quick access.

### v2.9 Features

- **Toast Notifications**: Non-intrusive popup messages for status updates (e.g., "Saved", "Error").
- **PWA Support**: The app can be installed as a Progressive Web App (PWA) and works offline.
- **Lazy Loading**: Content is loaded only when needed, improving initial load times.

## Import & Export

- **YAML Support**: Import and export your entire collection or specific parts in YAML format.
- **ZIP Export**: Download your entire collection as a ZIP file, preserving the folder structure as directories.
- **Config Export**: Share or backup your application settings (excluding API keys).
