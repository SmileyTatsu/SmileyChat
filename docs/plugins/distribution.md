# Plugin Distribution

SmileyChat supports two plugin distribution paths:

- Local plugins copied manually into `userData/plugins`.
- Verified registry plugins installed from Options > Plugins > Store.

Verified registry installs use one ZIP archive per plugin version. The registry stores the archive URL and SHA-256 hash so SmileyChat can install exactly the reviewed artifact.

## Verified Registry Entry

Registry plugins use this shape:

```json
{
    "id": "example-plugin",
    "name": "Example Plugin",
    "version": "1.0.0",
    "description": "Adds one useful extension.",
    "author": "Example Author",
    "category": "tools",
    "status": "verified",
    "archive": {
        "url": "https://github.com/example/example-plugin/releases/download/v1.0.0/example-plugin.zip",
        "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
}
```

`status` must be either `official` or `verified`.

`id` must be a safe folder name and must match the `id` inside the packaged `plugin.json`.

The archive URL must be HTTPS and must be on a host allowed by the SmileyChat plugin registry configuration.

## ZIP Layout

The ZIP can contain files directly at the archive root:

```txt
example-plugin.zip
  plugin.json
  dist/
    index.js
    style.css
  assets/
    icon.png
```

GitHub-style archives with one containing folder are also accepted:

```txt
example-plugin.zip
  example-plugin-1.0.0/
    plugin.json
    dist/
      index.js
      style.css
```

During install, SmileyChat auto-hoists a single containing folder so `plugin.json` ends up at the plugin root.

## Package Requirements

A verified archive must include:

- `plugin.json` at the root after optional auto-hoisting.
- The file referenced by `plugin.json.main`.
- Every file referenced by `plugin.json.styles`.

The packaged manifest must have the same `id` as the registry entry.

Do not include generated caches, source maps with private paths, test fixtures, `.env` files, API keys, or local user data.

## Installation Safety Checks

When installing a verified plugin, SmileyChat:

- Fetches the registry from the configured registry URL.
- Finds the requested plugin by ID.
- Rejects IDs that collide with core extensions.
- Downloads one ZIP archive.
- Verifies the archive SHA-256 hash before extracting.
- Extracts entries only inside a temporary staging directory.
- Rejects absolute paths, drive-letter paths, `..` path segments, and backslash paths.
- Enforces a compressed archive size limit.
- Enforces per-file and total extracted size limits.
- Skips common ZIP metadata entries such as `__MACOSX` and `.DS_Store`.
- Auto-hoists one containing folder when present.
- Validates `plugin.json`, `main`, and `styles`.
- Preserves the existing plugin `data/` folder during updates.
- Swaps the staged plugin into `userData/plugins/{pluginId}` only after validation succeeds.

## Building A Release ZIP

A simple release folder should look like this before compression:

```txt
release/
  plugin.json
  dist/
    index.js
    style.css
  assets/
    icon.png
```

On Windows PowerShell:

```powershell
Compress-Archive -Path .\release\* -DestinationPath .\example-plugin.zip -Force
Get-FileHash .\example-plugin.zip -Algorithm SHA256
```

On macOS or Linux:

```bash
cd release
zip -r ../example-plugin.zip .
cd ..
sha256sum example-plugin.zip
```

Use the resulting SHA-256 value in the registry entry.

## Review Guidance

For verified plugins, review the exact archive artifact before adding or updating the registry entry.

Prefer release artifacts with stable version tags. Avoid registry entries that point at mutable branch archives such as `main.zip`, because the archive content can change while the URL stays the same.

Changing plugin code should require:

1. A new archive.
2. A new SHA-256 hash.
3. A registry entry update.

## Local Development Vs Verified Distribution

Local development can be loose and fast: edit files under `userData/plugins`, refresh, and reload.

Verified distribution should be reproducible: package a release folder, calculate the hash, review the artifact, then update the registry.
