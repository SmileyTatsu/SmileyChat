# How to Backup and Restore Your Data

SmileyChat is a **local-first** application. All of your data, including chats, characters, settings, presets, LoreBooks, plugins, and personas, is stored on your computer in standard files. There are no hidden databases or cloud locks.

## The `userData` Folder

Everything that makes your SmileyChat yours lives in one folder:

```text
userData/
```

Inside this folder, you will find:

- `characters/`: Character cards and avatars.
- `chats/`: Chat logs and uploaded images.
- `personas/`: User profiles and avatars.
- `presets/`: Prompt presets and generation settings.
- `lorebooks/`: Native LoreBooks and imported World Info data.
- `settings/`: Preferences, connection profiles, and the separate local API key file.
- `plugins/`: Locally installed trusted plugins and plugin-owned storage.

API keys are stored in `userData/settings/connection-secrets.json`. They are separated from normal connection settings to reduce accidental export, but they are not encrypted at rest.

## How to Backup

1. Fully close SmileyChat.
2. Copy the entire `userData` folder.
3. Paste it onto a USB drive, cloud storage, or another safe location.

If your backup location is shared or synced to a third party, remember that `connection-secrets.json` may contain provider API keys.

## How to Restore or Move to a New PC

1. Install SmileyChat on the new computer.
2. Before starting it for the first time, replace the empty `userData` folder with your backed-up `userData` folder.
3. Start SmileyChat.

All chats, characters, personas, presets, LoreBooks, settings, and plugins should be available from the restored folder.

For the full storage layout, see [User Data & Storage](../reference/user-data.md).
