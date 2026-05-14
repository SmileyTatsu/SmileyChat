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

## Save Plugin Settings

Requires `ui:settings`.

```js
export function activate(api) {
    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Counter",
        render: () => {
            let count = 0;

            async function increment() {
                const data = await api.storage.getJson("settings", { count: 0 });
                count = data.count + 1;
                await api.storage.setJson("settings", { count });
            }

            return api.ui.h(
                "button",
                { type: "button", onClick: increment },
                "Increment",
            );
        },
    });
}
```

This example keeps the UI minimal. More complex plugin settings should use a small Preact component bundled into the plugin entry file.

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
