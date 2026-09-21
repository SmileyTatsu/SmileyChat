# Plugin Examples

## Cheese Output

This example matches the local test plugin at `userData/plugins/cheese-output`.

`plugin.json`

```json
{
    "id": "cheese-output",
    "name": "Cheese Output",
    "version": "1.0.0",
    "description": "Replaces every word in AI output with Cheese.",
    "main": "dist/index.js",
    "permissions": ["chat:output", "ui:settings"],
    "enabled": false
}
```

`dist/index.js`

```js
const wordPattern = /[\p{L}\p{N}_]+/gu;

export function activate(api) {
    api.chat.registerOutputMiddleware((content) => {
        return content.replace(wordPattern, "Cheese");
    });

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Cheese Output",
        render: () =>
            api.ui.h("section", { className: "tool-window" }, [
                api.ui.h("h2", null, "Cheese Output"),
                api.ui.h(
                    "p",
                    null,
                    "Enabled. Every word in generated character replies is replaced with Cheese.",
                ),
            ]),
    });
}
```

## Add A Composer Button

Requires `ui:composer`.

```js
export function activate(api) {
    api.ui.registerComposerAction({
        id: "insert-action",
        label: "Action",
        run: ({ insertText }) => {
            insertText("*looks around*");
        },
    });
}
```

## Add A Composer Option

Requires `ui:composer`.

```js
export function activate(api) {
    api.ui.registerComposerOption({
        id: "insert-scene-break",
        label: "Scene break",
        renderIcon: () => api.ui.h("span", { "aria-hidden": "true" }, "+"),
        run: ({ insertText }) => {
            insertText("\n\n---\n\n");
        },
    });
}
```

## Add A Prompt Macro

Requires `presets:macros`.

```js
export function activate(api) {
    api.presets.registerMacro("active_character", (context) => {
        return context.character.data.name;
    });
}
```

Usage:

```txt
You are writing with {{active_character}}.
```

## Save Plugin Settings (Autosaving)

Requires `ui:settings`.

SmileyChat manages plugin settings autosave, queued writes, unmount flushing,
and save status indicators automatically. Plugins register their default
settings and call `updateSettings(patch)` or declare form fields. Panel edits
are debounced by 700ms; `api.settings.set(...)` is intended for programmatic
updates and persists immediately.

```js
export async function activate(api) {
    await api.settings.register({
        defaultValues: { count: 0 },
    });

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Counter",
        render: ({ settings, updateSettings }) => {
            return api.ui.h(
                "button",
                {
                    type: "button",
                    onClick: () => updateSettings({ count: (settings.count ?? 0) + 1 }),
                },
                `Count: ${settings.count ?? 0}`,
            );
        },
    });
}
```

When registering more than one settings object, give the panel the matching
`settingsKey`:

```js
await api.settings.register({
    key: "advanced",
    defaultValues: { enabled: false },
});

api.ui.registerSettingsPanel({
    id: "advanced",
    label: "Advanced",
    settingsKey: "advanced",
    render: ({ settings, updateSettings }) =>
        api.ui.h(
            "button",
            {
                type: "button",
                onClick: () => updateSettings({ enabled: !settings.enabled }),
            },
            settings.enabled ? "Disable" : "Enable",
        ),
});
```

Or declare zero-code settings fields:

```js
export async function activate(api) {
    await api.settings.register({
        defaultValues: { enabled: true, limit: 10 },
    });

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "My Extension",
        fields: [
            {
                type: "toggle",
                key: "enabled",
                label: "Enable Feature",
                description: "Turn on processing",
            },
            {
                type: "number",
                key: "limit",
                label: "Max items",
                min: 1,
                max: 100,
            },
        ],
    });
}
```

Supported declarative field types are `toggle`/`checkbox`, `number`, `text`,
`textarea`, and `select`. See the API reference for their optional constraints
and presentation properties.

## Add A Message Action

Requires `ui:message-actions`.

```js
export function activate(api) {
    api.ui.registerMessageAction({
        id: "log-message",
        label: "Log message",
        run: ({ message, content }) => {
            console.log(message.id, content);
        },
    });
}
```
