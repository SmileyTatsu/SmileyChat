# User Data Persistence

SmileyChat is a local-first application. It does not use `localStorage` or `IndexedDB` for core persistence. Instead, all user-generated content is saved to the local file system inside the `userData/` directory.

This ensures that data is easy to inspect, back up, edit manually, and move between installations.

## Directory Structure

- `userData/characters/`: Contains your character library.
    - `library/`: Each character is stored in a subfolder (e.g., `luna-f987e46f`) containing a `character.json` and its `avatar.png/jpg`. This avoids filename collisions.
    - `imports/`: Drop `.png` or `.json` (Tavern/SillyTavern V1/V2/V3 format) files here. The backend will automatically normalize and import them on startup or when the import API is called.
    - `archive.json`: Remembers the character ID assigned to each imported card fingerprint. Re-importing a card whose character was deleted reuses that ID instead of creating a new one.
    - `orphaned/`: Folders that declare a character ID already claimed by another folder are moved here, so the library keeps one folder per character.
    - `index.json`: Maintains the list of active characters, their order, and summaries.
- `userData/chats/`: Chat sessions are stored here as individual JSON files.
    - `sessions/`: JSON files for each chat session.
    - `assets/`: Per-chat image files used by message attachments and current group custom avatars. Deleting a chat removes its asset folder; replacing a group avatar deletes the previous avatar attachment through the attachment delete API.
    - `trash/`: Chats deleted from the UI, with the assets they need to be restored. `POST /api/chats/{chatId}/restore` puts one back; entries older than 7 days or beyond the newest 40 are pruned automatically.
    - `orphaned/`: Files that fail to parse are moved here and skipped, so one broken JSON file cannot stop chats from loading. Chat deletion does not use it.
    - `index.json`: Tracks active chats per character and session metadata.
- `userData/personas/`: Your personas (user profiles).
    - `cards/`: JSON files for each persona (name, description, dialogue highlight color).
    - `assets/`: Avatar images for personas.
    - `orphaned/`: Files that fail to parse are moved here and skipped.
- `userData/presets/`: Contains generation presets (context templates, macros).
- `userData/instruct/`: Contains **beta** custom instruct templates. `templates.json` is the saved collection; additional loose JSON template files are discovered and imported at read time. These templates are used by the Formatting tab and compatible text-completion requests.
- `userData/lorebooks/`: Contains native LoreBook files and the LoreBook index.
    - `books/`: JSON files for each LoreBook.
    - `imports/`: Drop SmileyChat LoreBook JSON or SillyTavern World Info JSON here for import workflows.
    - `orphaned/`: Files that fail to parse are moved here and skipped.
    - `index.json`: Tracks active LoreBook selection, ordering, and summaries.
- `userData/settings/`: App configuration.
    - `preferences.json`: Local UI and runtime preferences (dark mode, font size, streaming, SillyTavern sync settings, dialogue highlights, and logging subsystem/retention configurations).
    - `connections.json`: Provider URLs and generic model settings.
    - `connection-secrets.json`: **API Keys**. This is kept strictly separated so it is less likely to be accidentally exported, but it is not encrypted at rest.
    - `csrf-secret.json`: Token used to secure local API endpoints.
    - `plugin-profiles.json`: Saved plugin profile selection plus user-created plugin profile definitions.
    - `plugin-grants.json`: Runtime permissions the user approved per plugin (`server:process`, `connections:secrets`). Approve or revoke them in Options > Plugins.
    - `core-extensions/`: Storage for built-in extension data.
        - `mcp.json`: Settings for Model Context Protocol servers.
        - `mcp-secrets.json`: Secrets and credentials for MCP servers.
        - `chat-summarizer/`, `smiley-post-processing/`, `smiley-image-generation/`: settings left by extensions that used to ship inside the app. Installing the matching Store plugin copies these `*.json` files into the plugin's own `data/` folder, so the old files can be kept as a backup.
- `userData/logs/`: Daily rotating server and diagnostics log files.
    - `smileychat-YYYY-MM-DD.log`: Active log file for the day (rotates to indexed files like `-1.log` if exceeding 10MB). Automatically pruned based on age (default 7 days) and total storage size (default 25MB) configured in Diagnostics settings.
- `userData/plugins/`: Folder for user-installed extension modules.
    - Each plugin folder contains `plugin.json`, browser ESM files, optional CSS, and plugin-owned `data/{key}.json` storage.
    - Plugins installed or updated by SmileyChat also contain `smileychat-install.json`, which records whether the plugin came from the verified registry or a manual artifact URL.

Deleting a character, persona, or LoreBook from the app removes its files; only chats go to a restorable `trash/` folder. Keep a backup of `userData/` before deleting anything you might want back.

## File Formats

SmileyChat uses its own internal normalized formats, heavily inspired by existing V2 card formats for maximum compatibility. When importing SillyTavern or Tavern cards, unsupported fields are safely preserved inside an `extensions.smileychat` object to ensure no data loss during export.

Group chat definitions can be exported as `smileychat_group` JSON with member metadata and group settings, but without message history. Custom group avatar image paths are local assets and are not treated as portable room data.
