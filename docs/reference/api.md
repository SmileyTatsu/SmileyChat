# Local Application API

SmileyChat provides a local API via its Bun server (`server/index.ts`) for managing local data structures, extensions, generation, and connections. This API is used by the frontend and is available at `http://localhost:port/api/*`.

These routes provide filesystem persistence to `userData/` and proxy capabilities (e.g. Generation, Plugin fetch) without exposing raw secrets to the client app.

## Characters

- `GET /api/characters`: Load the saved character collection index, creating defaults if missing.
- `POST /api/characters`: Create a new character.
- `PUT /api/characters/index`: Save the active character and ordering metadata.
- `GET /api/characters/:characterId`: Load a single saved character by ID.
- `PUT /api/characters/:characterId`: Update a single character by ID.
- `PATCH /api/characters/:characterId`: Patch a single character's data field without overwriting other properties.
- `DELETE /api/characters/:characterId`: Delete a character (accepts `?deleteChats=true` to delete associated chats).
- `GET /api/characters/:characterId/avatar`: Serve a saved character's avatar image.
- `POST /api/characters/:characterId/avatar`: Upload and save a character avatar image.
- `GET /api/characters/:characterId/export.json`: Export the character as a JSON card.
- `GET /api/characters/:characterId/export.png`: Export the character as a PNG card (with embedded metadata).
- `POST /api/characters/import-dropped`: Scan `userData/characters/imports` for manually dropped JSON/PNG character cards.
- `POST /api/characters/import`: Import uploaded JSON/PNG character card files via multipart form data (`files` field).

## Chats & Assets

- `GET /api/chats`: Load saved chat summaries, creating the chat index if missing.
- `POST /api/chats`: Create a new saved chat session JSON file.
- `GET /api/chats/:chatId`: Load a saved chat session by ID.
- `PUT /api/chats/:chatId`: Update a chat session.
- `PATCH /api/chats/:chatId/metadata`: Patch a chat session's title, mode, and metadata without modifying messages.
- `DELETE /api/chats/:chatId`: Delete a saved chat session.
- `POST /api/chats/:chatId/fork`: Fork an existing chat at a specific message ID.
- `PUT /api/chats/index`: Save active chat selection metadata.
- `POST /api/chats/import`: Import a general chat payload as a new saved chat.
- `POST /api/chats/:chatId/attachments`: Upload image or file attachments to a specific chat.
- `GET /api/chats/:chatId/attachments/:file`: Serve a saved chat attachment.
- `DELETE /api/chats/:chatId/attachments/:file`: Delete a saved chat attachment.
- `GET /api/chats/:chatId/export-group.json`: Export a group chat definition (excluding message history).
- `POST /api/chats/import-group`: Import a group chat definition as a new saved chat.

## Personas

- `GET /api/personas`: Load saved persona summaries, creating defaults if missing.
- `POST /api/personas`: Create a saved persona JSON file.
- `GET /api/personas/:personaId`: Load one saved persona.
- `PUT /api/personas/:personaId`: Save one saved persona.
- `DELETE /api/personas/:personaId`: Delete one saved persona.
- `PUT /api/personas/index`: Save active persona and ordering metadata.
- `POST /api/personas/:personaId/avatar`: Save a persona avatar image.
- `GET /api/personas/assets/:file`: Serve saved persona avatar images.

## Connections & Generation

- `GET /api/connections`: Load saved connection settings, creating defaults if missing.
- `PUT /api/connections`: Save connection settings to JSON.
- `GET /api/connections/secrets`: Load saved connection secrets (requires privileged access if accessed remotely).
- `PUT /api/connections/secrets`: Save connection secrets to JSON (requires privileged access).
- `GET /api/connections/:profileId/models`: List available models for a specific connection profile by querying the upstream provider.
- `POST /api/generate`: Generate a response using a saved connection profile. Routes through the server to avoid exposing API keys to the frontend UI.

## LoreBooks

- `GET /api/lorebooks`: Load saved LoreBook summaries.
- `POST /api/lorebooks`: Create a saved LoreBook JSON file.
- `GET /api/lorebooks/:lorebookId`: Load one saved LoreBook.
- `PUT /api/lorebooks/:lorebookId`: Update one LoreBook.
- `PATCH /api/lorebooks/:lorebookId`: Patch one LoreBook's settings, title, description, and metadata without replacing entries.
- `POST /api/lorebooks/:lorebookId/entries`: Add a new entry to the LoreBook.
- `PUT /api/lorebooks/:lorebookId/entries/:entryId`: Update an existing LoreBook entry.
- `DELETE /api/lorebooks/:lorebookId/entries/:entryId`: Remove a LoreBook entry.
- `DELETE /api/lorebooks/:lorebookId`: Delete one saved LoreBook.
- `PUT /api/lorebooks/index`: Save active LoreBook and ordering metadata.
- `POST /api/lorebooks/import`: Import uploaded SmileyChat or SillyTavern World Info JSON files.
- `GET /api/lorebooks/:lorebookId/export.json`: Export LoreBook as SillyTavern-compatible World Info JSON.
- `GET /api/lorebooks/:lorebookId/export.smiley.json`: Export LoreBook as SmileyChat native JSON.

## Settings & Presets

- `GET /api/preferences`: Load saved local app preferences (UI configs).
- `PUT /api/preferences`: Save local app preferences to JSON.
- `GET /api/presets`: Load saved preset collection, creating defaults if missing.
- `PUT /api/presets`: Save preset collection to JSON.

## Core Extensions / Model Context Protocol (MCP)

- `GET /api/mcp`: Read registered MCP servers.
- `POST /api/mcp/:serverId/connect`: Connect to a specified MCP server.
- `POST /api/mcp/:serverId/disconnect`: Disconnect from an MCP server.
- `POST /api/mcp/:serverId/refresh`: Refresh an MCP server connection.
- `POST /api/mcp/:serverId/tools/:toolName`: Call a tool registered by the specified MCP server.

## Plugins API

_See [Plugin API Reference](../plugins/api-reference.md) for full context on plugins logic._

- `GET /api/plugins`: Discover bundled core extensions and installed local plugin manifests.
- `PUT /api/plugins/:pluginId`: Enable or disable one plugin.
- `GET /api/plugins/registry`: Load the verified extension registry.
- `POST /api/plugins/install`: Install a registry plugin or a manual ZIP artifact.
- `POST /api/plugins/:pluginId/update`: Update a plugin installed by SmileyChat.
- `POST /api/plugins/fetch`: SSRF-guarded outbound fetch for trusted local plugins (gated by `.env`).
- `GET /api/plugins/profiles`: Load plugin profile state.
- `PUT /api/plugins/profiles`: Save plugin profile state.
- `DELETE /api/plugins/profiles/:profileId`: Delete a user plugin profile.
- `GET /api/plugins/:pluginId/storage`: Load a full plugin-owned JSON storage snapshot.
- `PUT /api/plugins/:pluginId/storage`: Replace a full plugin-owned JSON storage snapshot.
- `GET /api/plugins/:pluginId/storage/:key`: Load plugin-owned JSON storage value.
- `PUT /api/plugins/:pluginId/storage/:key`: Save plugin-owned JSON storage value.
- `DELETE /api/plugins/:pluginId/storage/:key`: Delete plugin-owned JSON storage value.

## System & Security

- `GET /api/health`: Basic health check endpoint returning `{ ok: true }`.
- `GET /api/csrf`: Get a CSRF token for securing subsequent API modifications.
