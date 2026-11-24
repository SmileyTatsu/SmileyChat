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
    "icon": "assets/icon.png",
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

`icon`

Optional path to a square image inside the plugin folder (`assets/icon.png`). PNG, WebP, and SVG all work: the app renders it through an `<img>`, so SVG cannot run script. Use at least 128×128. A missing, unsafe, or unreadable icon falls back to a monogram tile made from the plugin name, so the field is never required. Store entries also carry an optional `icon` URL in the registry, shown before the artifact is installed.

`permissions`

Optional list of permission labels. These are displayed to the user before install and enforced by the runtime for protected plugin APIs. If a plugin calls a protected API without the matching permission, that call throws and the plugin may show as a load error.

Store installs cross-check this list against the registry entry's optional `permissions` list. If the registry lists permissions for the artifact, a manifest that asks for anything else is rejected before it is installed.

Recommended labels:

- `state:read`
- `ui:settings`
- `ui:sidebar`
- `ui:character-details`
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
- `chat:display`
- `chat:prompt-context`
- `chat:prompt-inject`
- `chat:prompt`
- `chat:output`
- `chat:message-update`
- `presets:macros`
- `connections:providers`
- `tools:register`
- `events`
- `storage`

`storage` is currently a user-visible label only. The storage API is available to loaded plugins without a separate runtime permission.

`model:generate` covers custom model requests plus related local model utilities:
`api.model.generate`, `api.model.estimateTokens`, and
`api.model.getContextBudget`.

`connections:providers` permits registering browser-run connection adapters. A
provider using `promptMode: "text-completion"` can use
`api.formatting.formatTextCompletionPrompt(...)` to serialize the active
instruct template and prompt messages.

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
