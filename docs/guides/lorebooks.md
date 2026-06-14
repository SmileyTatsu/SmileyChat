# Using LoreBooks

LoreBooks store reusable world, setting, character, and background information that can be injected into a chat prompt when relevant.

SmileyChat has native LoreBook storage, import, export, and a bundled LoreBook Manager extension for fuller editing.

## Where to Find LoreBooks

1. Open **Options** from the bottom-left persona bar.
2. Choose the LoreBook area in the options panel.
3. Use the compact list to create, import, export, or inspect LoreBooks.
4. Use the bundled **LoreBook Manager** extension for full editing when it is enabled.

## What LoreBooks Are For

Use LoreBooks for information that should be available to the AI without putting it in every character description or every message.

Good examples:

- Setting history.
- Faction details.
- Locations.
- Recurring side characters.
- Magic systems, technology rules, or writing constraints.

Avoid using LoreBooks for connection settings, API keys, or one-off chat notes. Use Connections for provider setup and Author Notes for chat-specific prompt notes.

## Import and Export

SmileyChat supports importing native SmileyChat LoreBook JSON and SillyTavern World Info JSON.

The local API supports:

- `POST /api/lorebooks/import`
- `GET /api/lorebooks/{id}/export.json` for SillyTavern-compatible World Info export.
- `GET /api/lorebooks/{id}/export.smiley.json` for native SmileyChat export.

## Storage

LoreBooks are stored in `userData/lorebooks/`. The index stores active ordering and summaries, while individual LoreBook files live under `userData/lorebooks/books/`.

For the broader storage layout, see [User Data & Storage](../reference/user-data.md).
