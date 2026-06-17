# Plugin Development

This guide describes the practical flow for creating a SmileyChat plugin.

Plugins are trusted browser ESM modules. They run in the app page, register hooks through the runtime API, and are discovered from `userData/plugins/{pluginFolder}/plugin.json`.

## Recommended Workflow

1. Create a folder under `userData/plugins`.
2. Add `plugin.json`.
3. Add a browser-ready ESM entry file.
4. Start SmileyChat.
5. Open Options > Plugins and press Refresh.
6. Enable, disable, and configure the plugin from its plugin card.

For local development, a plugin can be plain JavaScript. A build step is only needed when the plugin author wants TypeScript, JSX, bundling, or npm dependencies.

Local folder plugins are development-only. They do not get `smileychat-install.json`
and SmileyChat does not update them from the Extension Store.

## Minimal Plugin

```txt
userData/plugins/
  my-plugin/
    plugin.json
    dist/
      index.js
```

```json
{
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "description": "Trims model replies before they are saved.",
    "main": "dist/index.js",
    "permissions": ["chat:output"],
    "category": "input-output",
    "enabled": true
}
```

```js
export function activate(api) {
    api.chat.registerOutputMiddleware((content) => content.trim());
}
```

`activate(api)` may return a cleanup function. SmileyChat calls it when the plugin is deactivated or reloaded in the current browser session.

```js
export function activate(api) {
    const off = api.events.on("my-plugin:changed", () => {});
    return () => off();
}
```

## Manifest Rules

Keep `id` stable. Plugin storage, profiles, and registry installs are keyed by plugin ID.

Use the narrowest permissions that match the plugin behavior. Permission labels are enforced by the runtime for protected APIs, but plugins are still trusted local code and are not a sandbox.

Use `category` to make the plugin easier to find in Options > Plugins:

- `interface`
- `input-output`
- `automation`
- `connections`
- `tools`
- `memory-lore`
- `other`

See [manifest.md](manifest.md) for the full manifest reference.

## Assets And Styles

Plugin files are served from:

```txt
/plugins/{pluginFolder}/...
```

Use relative manifest paths for entry files and styles:

```json
{
    "main": "dist/index.js",
    "styles": ["dist/style.css"],
    "permissions": ["ui:styles"]
}
```

When referencing images or other plugin assets from runtime UI, use the served URL:

```js
const iconUrl = "/plugins/my-plugin/assets/icon.png";
```

Namespace CSS classes with the plugin ID to avoid affecting core UI.

## Storage

Use `api.storage` for plugin-owned JSON settings and data.

```js
export function activate(api) {
    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Settings",
        render: ({ storage }) =>
            api.ui.h(
                "button",
                {
                    type: "button",
                    onClick: async () => {
                        const settings = await storage.getJson("settings", {
                            enabled: true,
                        });
                        await storage.setJson("settings", {
                            ...settings,
                            enabled: !settings.enabled,
                        });
                    },
                },
                "Toggle",
            ),
    });
}
```

User plugin storage is written to:

```txt
userData/plugins/{pluginId}/data/{key}.json
```

Plugin profiles can snapshot and restore this storage.

## Provider Plugins

Connection provider plugins should register through `api.connections.registerProvider` instead of patching core connection code.

Provider calls run from the frontend by default and are subject to browser CORS rules. Use `api.network.fetch` only for trusted helper APIs that need the guarded local fetch bridge.

## Local Testing Checklist

Before sharing a plugin:

- The plugin loads from a fresh SmileyChat start.
- Enable and disable behavior works without stale UI.
- Every protected API call has the matching manifest permission.
- Missing settings or empty storage use safe defaults.
- Styles are scoped to plugin-specific classes.
- `main` and every `styles` path exists.
- No API keys or user secrets are written to plugin storage unless clearly documented.

## Publishing Checklist

Before publishing a release artifact:

- Build the plugin in the plugin repository.
- Package only `plugin.json`, built files, declared styles, and needed assets.
- Keep `plugin.json` at the ZIP root.
- Do not include `src`, tests, `.git`, `node_modules`, lockfiles, build configs, `.env`, or local user data.
- Install the generated ZIP through a clean SmileyChat manual artifact install or registry entry.
- Confirm the user does not need `git`, dependency installation, or a build step.
- Update the verified registry entry with `artifact.url` when the reviewed artifact is ready.
