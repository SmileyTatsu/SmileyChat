# Plugin Distribution

SmileyChat supports three plugin distribution paths:

- Extension Store installs from the verified registry.
- Manual artifact installs from an HTTPS ZIP URL, only when explicitly enabled.
- Local folder plugins copied into `userData/plugins` for development.

End users should install prebuilt artifacts. SmileyChat does not run `git`,
`bun install`, `bun run build`, or any other plugin build command during install.

## Registry Format

Registry plugins use this shape:

```json
{
    "version": 1,
    "plugins": [
        {
            "id": "example-plugin",
            "name": "Example Plugin",
            "version": "1.0.0",
            "description": "Adds one useful extension.",
            "author": "Example Author",
            "category": "tools",
            "status": "verified",
            "repository": "https://github.com/example/example-plugin",
            "permissions": ["chat:output", "ui:settings"],
            "artifact": {
                "url": "https://github.com/example/example-plugin/releases/download/v1.0.0/example-plugin-1.0.0.zip"
            }
        }
    ]
}
```

Rules:

- `version` must be `1`.
- `id` must be a safe folder name and must match the packaged `plugin.json`.
- `status` must be `official` or `verified`.
- `category` must be one of SmileyChat's plugin categories.
- `artifact.url` must be an HTTPS `.zip` URL.
- `repository` is optional but recommended so users can inspect source.
- `permissions` is optional. When present it must be an array of up to 32 non-empty
  strings (64 characters each) and lists the permissions this artifact was reviewed
  for. SmileyChat rejects a Store install or update whose `plugin.json` requests any
  permission missing from this list, with a `400` naming the extra permissions. An
  empty array means the artifact must declare no permissions. Entries without the
  field still install, and the Store shows an explicit "Permissions not listed by the
  registry" warning before install.
- SHA-256 hashes are not required for release v1.
- Registry artifacts may be hosted on GitHub Releases (`github.com` and its
  `*.githubusercontent.com` asset redirects) or on the registry's own host. Any other
  artifact host must be added to `SMILEYCHAT_PLUGIN_REGISTRY_ALLOWED_HOSTS`
  (comma-separated). Every redirect hop is checked against the same list.

The registry is a curated trust list. It is not a sandbox and does not make plugin
code safe to install from unknown authors.

## Artifact Layout

The ZIP must contain `plugin.json` at the archive root:

```txt
example-plugin-1.0.0.zip
  plugin.json
  dist/
    index.js
    style.css
  assets/
    icon.png
```

GitHub source archives with one containing folder are not accepted by the release
installer. Package the built plugin files at the ZIP root.

## Artifact Requirements

An artifact must include:

- Root `plugin.json`.
- The built browser ESM file referenced by `plugin.json.main`.
- Every CSS file referenced by `plugin.json.styles`.

Artifacts should not include:

- `.git`
- `node_modules`
- `src`
- tests
- lockfiles
- build configs
- `.env`
- local user data
- generated caches

The packaged manifest ID must match the registry entry for Store installs.

## Installation Flow

When installing or updating a Store plugin, SmileyChat:

1. Fetches the registry from `SMILEYCHAT_PLUGIN_REGISTRY_URL`.
2. Validates the registry entry and artifact URL.
3. Shows the registry-declared permissions and waits for the user to confirm.
4. Downloads one HTTPS ZIP artifact.
5. Extracts the ZIP into `userData/plugins/.installing/{pluginId}-{timestamp}`.
6. Rejects path traversal, absolute paths, Windows drive paths, backslash paths, too many entries, oversized files, and oversized extracted payloads.
7. Requires root `plugin.json`.
8. Validates `plugin.json`, `main`, and `styles`.
9. Rejects plugin IDs that collide with core extensions.
10. Rejects artifacts whose `plugin.json` requests a permission the registry entry does not list, naming the extra permissions in the error.
11. Moves the existing plugin aside if one is installed.
12. Copies the existing plugin `data/` folder into the staged plugin.
13. Writes `smileychat-install.json`.
14. Swaps the staged plugin into `userData/plugins/{pluginId}`.
15. Restores the previous plugin if validation or swap fails.

The installed metadata file looks like this for Store installs:

```json
{
    "source": "registry",
    "pluginId": "example-plugin",
    "artifactUrl": "https://github.com/example/example-plugin/releases/download/v1.0.0/example-plugin-1.0.0.zip",
    "repository": "https://github.com/example/example-plugin",
    "installedAt": "2026-06-17T00:00:00.000Z"
}
```

## Updates

Options > Plugins shows **Update** for plugins with `smileychat-install.json`.

- Registry-installed plugins update from the current registry entry for the same plugin ID.
- Manual artifact plugins update from the stored `artifactUrl`.
- Updates use the same staging, validation, swap, rollback, and `data/` preservation flow as installs.
- If the registry entry for the update lists permissions the installed plugin did not declare, the Store asks for confirmation again and lists only the added permissions.
- Local folder plugins are development-only and are not updateable by SmileyChat.

Updating never runs `git pull` or a build command.

## Manual Artifact Installs

Manual installs are hidden unless:

```txt
SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true
```

When enabled, Options > Plugins > Extension Store shows an **Install Artifact**
field. The URL must be an HTTPS `.zip` artifact with the same root layout described
above.

Manual installs write:

```json
{
    "source": "manual-artifact",
    "artifactUrl": "https://example.com/example-plugin-1.0.0.zip",
    "installedAt": "2026-06-17T00:00:00.000Z",
    "unverified": true
}
```

Manual artifacts are unverified trusted code. Enable this flow only when you know
where the artifact came from and trust the author.

## Local Development Vs Distribution

Local development can be loose and fast:

1. Build a plugin locally.
2. Copy or link the plugin folder into `userData/plugins/{pluginId}`.
3. Open Options > Plugins and press **Refresh**.
4. Enable, disable, and configure the plugin from its card.

Distribution should be release-oriented:

1. Build the plugin in the developer repository.
2. Package only `plugin.json`, built `dist/` files, declared styles, and needed assets.
3. Upload the ZIP to a release host.
4. Add or update the registry entry with `artifact.url`.
5. Users install or update from the Extension Store.

The user-facing install flow always consumes prebuilt artifacts.

## Review Guidance

For verified registry plugins, review the exact ZIP artifact before adding or updating
the registry entry.

Prefer immutable release URLs with stable version tags. Avoid mutable URLs that can
change while the registry entry stays the same.

Changing plugin code should require:

1. A newly built artifact.
2. A new release URL or versioned artifact path.
3. A registry entry update, including any `permissions` the artifact adds.
