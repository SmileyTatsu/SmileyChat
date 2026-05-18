# Plugin Manifest

Each plugin needs a `plugin.json` file at the root of its plugin folder.

```json
{
    "id": "example-plugin",
    "name": "Example Plugin",
    "version": "1.0.0",
    "description": "Short description shown in Options > Plugins.",
    "main": "dist/index.js",
    "styles": ["dist/style.css"],
    "permissions": ["chat:output", "ui:styles"],
    "enabled": true,
    "category": "interface"
}
```

## Fields

`id`

Stable plugin identifier. Use lowercase letters, numbers, hyphens, or underscores. Do not change it after users install the plugin because storage is keyed by plugin ID.
If the field is omitted or blank, SmileyChat falls back to the plugin folder name during manifest normalization.

`name`

User-facing plugin name.

`version`

User-facing version string. SmileyChat displays it but does not enforce semver yet.

`description`

Optional text shown in Options > Plugins.

`main`

Path to the browser ESM entry file, relative to the plugin folder.
If omitted or blank, SmileyChat falls back to `dist/index.js`.

`styles`

Optional list of CSS files, relative to the plugin folder. SmileyChat injects them before activating the plugin.
Plugins that define `styles` must include the `ui:styles` permission.

`permissions`

Optional list of permission labels. These are displayed to the user and enforced by the runtime for protected plugin APIs. If a plugin calls a protected API without the matching permission, that call throws and the plugin may show as a load error.

Recommended labels:

- `state:read`
- `ui:settings`
- `ui:sidebar`
- `ui:header`
- `ui:modals`
- `ui:messages`
- `ui:message-actions`
- `ui:composer`
- `ui:composer-state`
- `ui:styles`
- `actions`
- `model:generate`
- `network:fetch`
- `chat:input`
- `chat:prompt`
- `chat:output`
- `presets:macros`
- `connections:providers`
- `events`
- `storage`

`storage` is currently a user-visible label only. The storage API is available to loaded plugins without a separate runtime permission.

`enabled`

Optional boolean. Defaults to `true`. The Options > Plugins toggle writes this field.

`category`

Optional category label used purely for grouping plugins in Options > Plugins. Does not affect permissions or trust. Defaults to `other` when omitted or unrecognized.

Accepted values:

- `interface` — visual UI additions, message renderers, themes, side panels.
- `input-output` — transforms drafts, prompts, chat messages, or rendered output.
- `automation` — performs app actions automatically or semi-automatically.
- `connections` — adds model providers or provider-specific adapters.
- `tools` — explicit user-triggered utilities, slash commands, dice rollers, exporters.
- `memory-lore` — context, lorebooks, summaries, retrieval, long-term memory.
- `other` — fallback for uncategorized plugins.

## Runtime URLs

The server exposes plugin files under:

```txt
/plugins/{pluginFolder}/...
```

Plugins should not hardcode absolute local filesystem paths.
