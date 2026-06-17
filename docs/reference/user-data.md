# User Data Persistence

SmileyChat is a local-first application. It does not use `localStorage` or `IndexedDB` for core persistence. Instead, all user-generated content is saved to the local file system inside the `userData/` directory.

This ensures that data is easy to inspect, back up, edit manually, and move between installations.

## Directory Structure

- `userData/characters/`: Contains your character library.
    - `library/`: Each character is stored in a subfolder (e.g., `luna-f987e46f`) containing a `character.json` and its `avatar.png/jpg`. This avoids filename collisions.
    - `imports/`: Drop `.png` or `.json` (Tavern/SillyTavern V1/V2/V3 format) files here. The backend will automatically normalize and import them on startup or when the import API is called.
    - `index.json`: Maintains the list of active characters, their order, and summaries.
- `userData/chats/`: Chat sessions are stored here as individual JSON files.
    - `sessions/`: JSON files for each chat session.
    - `assets/`: Per-chat image files used by message attachments and current group custom avatars. Deleting a chat removes its asset folder; replacing a group avatar deletes the previous avatar attachment through the attachment delete API.
    - `orphaned/`: Safely holds data from deleted chats to prevent accidental loss.
    - `index.json`: Tracks active chats per character and session metadata.
- `userData/personas/`: Your personas (user profiles).
    - `cards/`: JSON files for each persona.
    - `assets/`: Avatar images for personas.
    - `orphaned/`: Safely holds data from deleted personas to prevent accidental loss.
- `userData/presets/`: Contains generation presets (context templates, macros).
- `userData/lorebooks/`: Contains native LoreBook files and the LoreBook index.
    - `books/`: JSON files for each LoreBook.
    - `imports/`: Drop SmileyChat LoreBook JSON or SillyTavern World Info JSON here for import workflows.
    - `orphaned/`: Safely holds data from deleted LoreBooks to prevent accidental loss.
    - `index.json`: Tracks active LoreBook selection, ordering, and summaries.
- `userData/settings/`: App configuration.
    - `preferences.json`: Local UI preferences (dark mode, font size, etc.).
    - `connections.json`: Provider URLs and generic model settings.
    - `connection-secrets.json`: **API Keys**. This is kept strictly separated so it is less likely to be accidentally exported, but it is not encrypted at rest.
    - `csrf-secret.json`: Token used to secure local API endpoints.
    - `plugin-profiles.json`: Saved plugin profile selection plus user-created plugin profile definitions.
    - `core-extensions/`: Storage for built-in extension data.
- `userData/plugins/`: Folder for user-installed extension modules.
    - Each plugin folder contains `plugin.json`, browser ESM files, optional CSS, and plugin-owned `data/{key}.json` storage.
    - Plugins installed or updated by SmileyChat also contain `smileychat-install.json`, which records whether the plugin came from the verified registry or a manual artifact URL.

## File Formats

SmileyChat uses its own internal normalized formats, heavily inspired by existing V2 card formats for maximum compatibility. When importing SillyTavern or Tavern cards, unsupported fields are safely preserved inside an `extensions.smileychat` object to ensure no data loss during export.

Group chat definitions can be exported as `smileychat_group` JSON with member metadata and group settings, but without message history. Custom group avatar image paths are local assets and are not treated as portable room data.
