# Plugin Quick Start

## Folder Layout

Install a plugin by placing it in `userData/plugins`:

```txt
userData/plugins/
  my-plugin/
    plugin.json
    dist/
      index.js
      style.css
```

SmileyChat discovers plugins through `plugin.json`. The plugin entry file must be browser-ready ESM. CSS files are optional.

## Minimal Manifest

```json
{
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "description": "Does one useful thing.",
    "main": "dist/index.js",
    "permissions": ["chat:output"],
    "enabled": true
}
```

## Minimal Plugin

```js
export function activate(api) {
    api.chat.registerOutputMiddleware((content) => {
        return content.trim();
    });
}
```

Restart SmileyChat after adding a new plugin, or open **Options > Plugins** and press **Refresh** to make the server list newly added plugin folders. If a newly discovered enabled plugin is still marked pending, disable and re-enable it or restart the app.

## Enable And Disable

Open **Options > Plugins** to see installed plugins. The plugin card shows:

- Name
- ID
- Version
- Description
- Status
- Main file
- Styles
- Permissions

Disabling an already-loaded plugin takes effect immediately for supported hooks. Enabling a listed local plugin from **Options > Plugins** loads it into the current browser session. Core extensions can also be disabled and re-enabled from the same screen.

## Plugin Configuration

Plugins can register configuration UI. It appears inside that plugin's card in **Options > Plugins > Configure**.

```js
export function activate(api) {
    api.ui.registerSettingsPanel({
        id: "settings",
        label: "My Plugin Settings",
        render: ({ storage }) =>
            api.ui.h("section", null, [api.ui.h("p", null, "Plugin settings go here")]),
    });
}
```

This requires the `ui:settings` permission. Use `api.storage` for plugin-owned settings and data.
