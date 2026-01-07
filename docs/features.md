# Features

This document details the features of the Wildcard Generator application.

## Core Functionality

### Hierarchical Organization
- **Nested Categories**: Create unlimited levels of folders and subfolders to organize your wildcards.
- **Drag & Drop**: Reorder items or move them between categories using drag and drop.

### AI Generation
- **LLM Integration**: Connect to powerful AI models via OpenRouter, Google Gemini, or any OpenAI-compatible API.
- **Context-Aware**: The AI understands the context of the folder structure to generate relevant items.
- **Custom Instructions**: Add specific instructions to categories or wildcard lists to guide the generation (e.g., "fantasy style", "sci-fi names").

### Wildcard Management
- **Manual Editing**: Add, edit, or delete wildcard items manually.
- **Batch Operations**: Select multiple items or categories to delete or move them in bulk.
- **Search**: Instantly search through all your wildcards with match highlighting.

## Advanced Features

### v2.17 Features (Latest)

- **Duplicate Finder Mode**:
  - **Unified "Dupe Finder" Button**: A single toolbar button activates the mode.
  - **Automated Actions**: Automatically enables "Show Wildcards", highlights duplicates, and filters the view to show only conflicts.
  - **Floating Action Bar**: Contextual bar with "Clean Up" and "Exit" buttons appears at the bottom of the screen.
  - **Mindmap Support**: Fully functional in Mindmap view with consistent highlighting and controls.
- **Improved Clean Up Dialog**:
  - **Simplified Interface**: Focused solely on resolving conflicts with "Keep Shortest" and "Keep Longest" tools.
  - **Conflict Statistics**: Clearly displays the number of duplicates found.
- **UI Refinements**:
  - **Icon-Only Toggle**: The "Show/Hide Wildcards" button is now a cleaner icon-only toggle (eye/eye-slash).

### v2.16 Features

- **Mindmap UX Polish**:
  - **Smart Context Menu**: Context menu actions dynamically hide based on node type (e.g., "Generate Wildcards" only shows for wildcard lists).
  - **Unified Terminology**: Mindmap now uses the same "Category" and "Wildcard" terminology as the List view.
  - **Enhanced Focus Mode**: 
    - Dedicated floating exit button for clearer navigation.
    - "Focus Mode" option hidden for wildcard items to prevent confusion.
  - **Visual Improvements**: Better button positioning and animations.

### v2.15 Features

- **Mind Elixir Mindmap View**: Alternative interactive visualization of your wildcards hierarchy.
  - **Three View Modes**: Switch between List (default), Mindmap (full-screen), or Dual Pane (synchronized side-by-side).
  - **Collapse/Expand Toggle**: Hide wildcards to show only categories with wildcard counts for a compact overview.
  - **AI Context Menu**: Right-click categories to access "Generate More" and "Suggest Children" actions directly in the mindmap.
  - **Theme Sync**: Mindmap automatically adapts to app's dark/light theme.
  - **View Persistence**: Your preferred view mode is saved across sessions.
  - **Toolbar Tooltips**: All Mind Elixir toolbar icons have descriptive tooltips.
  - **Smart Validation**: AI actions show helpful warnings when selected on root or wildcard nodes.

### v2.14 Features

- **Advanced Batch Operations**:
  - **Batch Generate**: Recursively generate content for all wildcard lists within selected folders (and sub-folders).
  - **Batch Suggest**: Generate suggestions for multiple categories seamlessly. Results are aggregated into a single review dialog.
  - **Granular Selection**: Wildcard cards now have individual checkboxes, allowing for mixed selection of specific lists and entire folders.
- **Improved UX**:
  - **Floating Batch Bar**: The batch operations toolbar is now a floating overlay, preventing layout shifts when selecting items.
  - **Unified Actions**: Delete and Generate actions work intelligently across mixed selections (files and folders).

### v2.13 Features

- **Enhanced Safety**:
  - **Double-Click Edit**: Category and wildcard names (and instructions) now require a double-click to edit.
  - **Edit Indicators**: Pencil icons appear on hover to clearly indicate editable fields.
  - **Toggle Protection**: Editing a name no longer toggles the category open/closed.
- **Improved Settings UX**:
  - **Save & Close**: Explicit options to Save, Discard, or Cancel when closing settings with unsaved changes.
  - **Modal Toasts**: Notifications now appear above dialogs for better visibility.
- **Advanced API Tools**:
  - **Streaming Generation**: Watch the AI generate wildcards character-by-character with a live elapsed timer.
  - **Test Model Dialog**: Detailed modal showing full JSON response, response time, and validation checks. Tests use real data from `initial-data.yaml` and the actual system prompt for realistic evaluation.
- **High-Performance Undo/Redo**:
  - **Diff-Based Updates**: Only changed UI elements are re-rendered, making undo/redo instantaneous even with thousands of wildcards.
  - **Granular Patches**: Uses a custom `deepDiff` algorithm to apply minimal DOM updates.
- **Visual Refinements**: Fixed light theme contrast issues and improved spacing.

### v2.12 Features

- **Import YAML/Settings**: functional import buttons for YAML wildcards and JSON settings files.
- **Data Management**: Simplified overflow menu with clear options:
  - **Restore Default Wildcards**: Reloads the starter data set without clearing your settings.
  - **Factory Reset**: Completely wipes all data and settings for a fresh start.
- **Enhanced Duplicate Detection**:
  - Visual highlighting with pulsing amber indicators
  - Filter view to show only duplicate-containing cards
  - Clear highlights action
- **Improved Help Dialog**: Structured help with sections, keyboard shortcuts table, and tips.
- **API Test Model Button**: Test your selected model with a realistic wildcard generation request using actual app data and prompts to verify response times and compatibility.

### v2.11 Features

- **Statistics Dashboard**: View real-time counts of categories, wildcards, and pinned items.
- **Batch Operations**:
    - **Select All**: Select all categories or items in a list.
    - **Bulk Actions**: Expand, collapse, or delete multiple selected categories at once.
- **Search Highlighting**: Search terms are visually highlighted in the results for easier scanning.
- **Secure Settings**: API keys are stored in session memory by default (not persisted) unless explicitly saved by the user.

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
