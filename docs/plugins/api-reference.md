# Plugin API Reference

Plugins export an `activate(api)` function from their `main` file.

```js
export function activate(api) {
    // register hooks here
}
```

`activate` may return a cleanup function. ScyllaChat calls it when the plugin is deactivated or reloaded in the current browser session.

```js
export function activate(api) {
    const off = api.events.on("my-plugin:changed", () => {});
    return () => off();
}
```

The API shape is defined in `src/lib/plugins/types.ts`. Most runtime APIs require matching `permissions` entries in `plugin.json`.
`api.state.getSnapshot()` can return `undefined` before the app has published its first plugin snapshot.

## Permissions

These permissions are currently enforced:

| API                                              | Required permission     |
| ------------------------------------------------ | ----------------------- |
| `api.state.getSnapshot`, `api.state.subscribe`   | `state:read`            |
| `api.ui.registerSettingsPanel`                   | `ui:settings`           |
| `api.ui.registerMessageRenderer`                 | `ui:messages`           |
| `api.ui.registerMessageAction`                   | `ui:message-actions`    |
| `api.ui.registerComposerAction`                  | `ui:composer`           |
| `api.ui.addStyles` and manifest `styles` loading | `ui:styles`             |
| `api.chat.registerInputMiddleware`               | `chat:input`            |
| `api.chat.registerPromptMiddleware`              | `chat:prompt`           |
| `api.chat.registerOutputMiddleware`              | `chat:output`           |
| `api.presets.registerMacro`                      | `presets:macros`        |
| `api.connections.registerProvider`               | `connections:providers` |
| `api.events.on`, `api.events.emit`               | `events`                |

`api.storage` is available to loaded plugins without a separate runtime permission, but `storage` is still a useful manifest label for user visibility.

## `api.plugin`

The normalized plugin manifest.

```js
console.log(api.plugin.id, api.plugin.name, api.plugin.version);
```

## `api.state`

Read or subscribe to app state.

```js
const snapshot = api.state.getSnapshot();

const unsubscribe = api.state.subscribe((snapshot) => {
    console.log(snapshot.character.data.name);
});
```

Requires `state:read`.

Snapshot contains:

- `mode`
- `activeChat`
- `messages`
- `character`
- `persona`
- `userStatus`
- `connectionSettings`
- `presetCollection`

Treat snapshots as read-only.

## `api.ui.h`

Preact `h` helper for plugin UI.

```js
api.ui.h("button", { type: "button" }, "Click me");
```

## `api.ui.registerSettingsPanel`

Adds custom configuration UI inside the plugin card in **Options > Plugins > Configure**.

```js
api.ui.registerSettingsPanel({
    id: "settings",
    label: "Settings",
    render: ({ pluginId, storage, snapshot }) =>
        api.ui.h("section", null, [api.ui.h("p", null, `Config for ${pluginId}`)]),
});
```

Requires `ui:settings`.

## `api.ui.registerMessageRenderer`

Overrides message content rendering.

```js
api.ui.registerMessageRenderer({
    id: "plain-uppercase",
    priority: 10,
    render: ({ content }) => api.ui.h("p", null, content.toUpperCase()),
});
```

Higher priority renderers run first. ScyllaChat currently uses the highest-priority renderer.
The bundled Chat Formatter core extension has priority `20`, so a local plugin must use a priority above `20` to replace the default formatted message renderer.

Requires `ui:messages`.

## `api.ui.registerMessageAction`

Adds actions to each message menu.

```js
api.ui.registerMessageAction({
    id: "copy-length",
    label: "Log length",
    run: ({ content }) => {
        console.log(content.length);
    },
});
```

Requires `ui:message-actions`.

## `api.ui.registerComposerAction`

Adds buttons above the composer input.

```js
api.ui.registerComposerAction({
    id: "insert-wave",
    label: "Wave",
    run: ({ insertText }) => {
        insertText("*waves*");
    },
});
```

Context includes:

- `draft`
- `setDraft`
- `insertText`
- `submit`
- `snapshot`

Requires `ui:composer`.

## `api.ui.addStyles`

Injects CSS into the app page.

```js
api.ui.addStyles(`
  .my-plugin-text {
    color: #e1e7ff;
  }
`);
```

Prefer scoped class names to avoid affecting core UI accidentally.

Requires `ui:styles`.

## `api.chat.registerInputMiddleware`

Runs after the user submits a draft and before the user message is saved.

```js
api.chat.registerInputMiddleware((content, context) => {
    return content.replaceAll("{{char}}", context.character.data.name);
});
```

Return the modified content. Async functions are supported.

Requires `chat:input`.

## `api.chat.registerPromptMiddleware`

Runs after presets are compiled and before the provider request is sent.

```js
api.chat.registerPromptMiddleware((messages, context) => {
    return [
        ...messages,
        {
            role: "system",
            content: "Keep replies concise.",
        },
    ];
});
```

Messages use chat-completion roles:

- `developer`
- `system`
- `user`
- `assistant`

Requires `chat:prompt`.

## `api.chat.registerOutputMiddleware`

Runs after the provider returns a response and before the character message is saved.

```js
api.chat.registerOutputMiddleware((content) => {
    return content.trim();
});
```

This is the right hook for cleanup, censorship, formatting, translation, or test transformations.

Requires `chat:output`.

## `api.presets.registerMacro`

Adds a macro that works in presets and user text macro resolution.

```js
api.presets.registerMacro("mood", (context) => {
    return context.mode === "rp" ? "dramatic" : "casual";
});
```

Requires `presets:macros`.

Users can then write:

```txt
{{mood}}
```

## `api.connections.registerProvider`

Adds a connection provider without editing ScyllaChat source.

```js
api.connections.registerProvider({
    id: "example-provider",
    label: "Example Provider",
    defaultConfig: {
        baseUrl: "https://example.test/v1",
        model: "example-model",
    },
    createAdapter(profile) {
        return {
            id: "example-provider",
            label: "Example Provider",
            async generate(request) {
                return {
                    provider: "example-provider",
                    model: String(profile.config.model ?? ""),
                    message: "Example response",
                };
            },
        };
    },
    renderSettings({ profile, onChange, onSave, onTest, disabled }) {
        return api.ui.h("section", { className: "connection-provider-panel" }, [
            api.ui.h("label", null, [
                "Model",
                api.ui.h("input", {
                    value: profile.config.model ?? "",
                    disabled,
                    onInput: (event) =>
                        onChange({
                            ...profile.config,
                            model: event.currentTarget.value,
                        }),
                }),
            ]),
            api.ui.h("div", { className: "button-row" }, [
                api.ui.h("button", { type: "button", disabled, onClick: onSave }, "Save"),
                api.ui.h("button", { type: "button", disabled, onClick: onTest }, "Test"),
            ]),
        ]);
    },
    async testConnection(profile) {
        return `${profile.name} is configured.`;
    },
});
```

Requires `connections:providers`.

## `api.storage`

Plugin-owned JSON storage.

```js
const settings = await api.storage.getJson("settings", {
    enabled: true,
});

await api.storage.setJson("settings", {
    ...settings,
    enabled: false,
});

await api.storage.remove("settings");
```

Data is stored through:

```txt
userData/plugins/{pluginId}/data/{key}.json
```

Core extension storage uses:

```txt
userData/settings/core-extensions/{pluginId}/{key}.json
```

Keys are sanitized by the server.

## `api.events`

Simple plugin event bus.

```js
const off = api.events.on("my-plugin:changed", (payload) => {
    console.log(payload);
});

api.events.emit("my-plugin:changed", { ok: true });
```

Use namespaced event names to avoid collisions.

Requires `events`.
