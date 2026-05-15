# User Data Persistence

ScyllaChat is a local-first application. It does not use `localStorage` or `IndexedDB` for core persistence. Instead, all user-generated content is saved to the local file system inside the `userData/` directory.

This ensures that data is easy to inspect, back up, edit manually, and move between installations.

## Directory Structure

- `userData/characters/`: Contains your character library.
    - `library/`: Each character is stored in a subfolder (e.g., `luna-f987e46f`) containing a `character.json` and its `avatar.png/jpg`. This avoids filename collisions.
    - `imports/`: Drop `.png` or `.json` (Tavern/SillyTavern V1/V2/V3 format) files here. The backend will automatically normalize and import them on startup or when the import API is called.
    - `index.json`: Maintains the list of active characters, their order, and summaries.
- `userData/chats/`: Chat sessions are stored here as individual JSON files.
    - `sessions/`: JSON files for each chat session.
    - `orphaned/`: Safely holds data from deleted chats to prevent accidental loss.
    - `index.json`: Tracks active chats per character and session metadata.
- `userData/personas/`: Your personas (user profiles).
    - `cards/`: JSON files for each persona.
    - `assets/`: Avatar images for personas.
    - `orphaned/`: Safely holds data from deleted personas to prevent accidental loss.
- `userData/presets/`: Contains generation presets (context templates, macros).
- `userData/settings/`: App configuration.
    - `preferences.json`: Local UI preferences (dark mode, font size, etc.).
    - `connections.json`: Provider URLs and generic model settings.
    - `connection-secrets.json`: **API Keys**. This is kept strictly separated so it is never accidentally exported.
    - `csrf-secret.json`: Token used to secure local API endpoints.
    - `core-extensions/`: Storage for built-in extension data.
- `userData/plugins/`: Folder for user-installed extension modules.

## File Formats

ScyllaChat uses its own internal normalized formats, heavily inspired by existing V2 card formats for maximum compatibility. When importing SillyTavern or Tavern cards, unsupported fields are safely preserved inside an `extensions.scyllachat` object to ensure no data loss during export.
