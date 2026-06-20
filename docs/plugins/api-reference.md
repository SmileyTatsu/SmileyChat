# Plugin API Reference

Plugins export an `activate(api)` function from their `main` file.

```js
export function activate(api) {
    // register hooks here
}
```

`activate` may return a cleanup function. SmileyChat calls it when the plugin is deactivated or reloaded in the current browser session.

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
| `api.actions.*`                                  | `actions`               |
| `api.model.generate`                             | `model:generate`        |
| `api.network.fetch`                              | `network:fetch`         |
| `api.ui.registerSettingsPanel`                   | `ui:settings`           |
| `api.ui.registerSidebarPanel`                    | `ui:sidebar`            |
| `api.ui.registerMessageRenderer`                 | `ui:messages`           |
| `api.ui.registerMessageAction`                   | `ui:message-actions`    |
| `api.ui.registerComposerAction`                  | `ui:composer`           |
| `api.ui.registerComposerOption`                  | `ui:composer`           |
| `api.ui.setComposerState`                        | `ui:composer-state`     |
| `api.ui.registerHeaderAction`                    | `ui:header`             |
| `api.ui.openModal`                               | `ui:modals`             |
| `api.ui.addStyles` and manifest `styles` loading | `ui:styles`             |
| `api.chat.registerInputMiddleware`               | `chat:input`            |
| `api.chat.registerPromptContextMiddleware`       | `chat:prompt-context`   |
| `api.chat.registerPromptInjector`                | `chat:prompt-inject`    |
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
- `characterPresence`
- `persona`
- `userStatus`
- `connectionSettings`
- `presetCollection`

Treat snapshots as read-only.

## `api.actions`

Programmatic app actions.

```js
await api.actions.sendMessage("Hello");
await api.actions.injectMessage("system", "Luna went offline.", {
    authorName: "SmileyChat",
    includeInPrompt: false,
});
await api.actions.generateResponse();
await api.actions.switchCharacter("character-id");
api.actions.setCharacterPresence("away");
api.actions.setDraft("Draft text");
api.actions.insertDraft(" appended text");
```

Requires `actions`.

### `api.actions.injectMessage`

Adds a message to the active chat without calling the active provider/model.

```js
await api.actions.injectMessage("character", "I need a moment.");
await api.actions.injectMessage("user", "Plugin-inserted user note.");
await api.actions.injectMessage("system", "Character is offline.", {
    authorName: "Presence",
    avatarPath: "/plugins/example-plugin/assets/presence.png",
    includeInPrompt: false,
});
```

Roles:

- `character`: appears as the active character by default.
- `user`: appears as the active persona by default.
- `system`: appears as an unregistered system-style speaker with optional custom name and avatar.

Options:

- `authorName`: override the visible message author.
- `avatarPath`: override the visible avatar path. Plugin asset URLs should use `/plugins/{pluginFolder}/...`.
- `includeInPrompt`: controls whether the message is included in future compiled prompts. Defaults to `true` for `character` and `user`, and `false` for `system`.
- `promptRole`: optional prompt role when included: `assistant`, `user`, `system`, or `none`.

Injected messages are stored in the active chat JSON using normal chat autosave. System messages are represented as visible message metadata, not as registered characters.

### `api.actions.setCharacterPresence`

Sets a runtime presence override for the active character.

```js
api.actions.setCharacterPresence("offline");
api.actions.setCharacterPresence("away");
api.actions.setCharacterPresence("dnd");
api.actions.setCharacterPresence("online");
```

Presence is UI/runtime state and is not saved to `userData`. Multiple plugins can set presence; the effective priority is `offline`, then `dnd`, then `away`, then `online`. A plugin's override is removed when that plugin is deactivated.

## `api.model.generate`

Sends a custom temporary message history through a configured connection/model and returns a normalized generation result. By default this uses the active connection profile, but a plugin can pass a `profileId` from `api.state.getSnapshot().connectionSettings.profiles` to target another saved profile without changing the user's active UI state. This does not append messages to the active chat and does not expose provider API keys to the plugin.

```js
const result = await api.model.generate({
    messages: [
        {
            role: "system",
            content: "You summarize lore entries for a roleplay chat.",
        },
        {
            role: "user",
            content: "Summarize this lore entry in two short bullets: ...",
        },
    ],
});

console.log(result.message);
```

Use another saved connection profile or preset generation settings when needed:

```js
const snapshot = api.state.getSnapshot();
const backgroundProfile = snapshot?.connectionSettings.profiles.find(
    (profile) => profile.name === "Background tasks",
);
const quickPreset = snapshot?.presetCollection.presets.find(
    (preset) => preset.title === "Fast summary",
);

const result = await api.model.generate({
    profileId: backgroundProfile?.id,
    presetId: quickPreset?.id,
    messages: [{ role: "user", content: "Summarize the last scene." }],
});
```

Streaming callbacks are optional:

```js
let text = "";

const result = await api.model.generate({
    stream: true,
    messages: [{ role: "user", content: "Write one atmospheric sentence." }],
    onToken: (token) => {
        text += token;
    },
});
```

Requires `model:generate`.

Notes:

- Uses the active connection profile and provider adapter by default.
- `profileId` optionally selects another saved connection profile for this request only. Unknown profile IDs throw an error.
- `presetId` optionally selects another preset's generation settings for this request only. Unknown preset IDs fall back to the active preset.
- Uses only the messages supplied by the plugin.
- Uses preset generation settings, but does not compile preset prompts.
- Does not run chat input, prompt, or output middleware.
- Supports multimodal message parts where the active provider supports them.

## `api.network.fetch`

Makes an outbound request through the local Bun server instead of the browser. This is intended for trusted local plugins that need non-provider helper APIs affected by CORS.

```js
const response = await api.network.fetch("https://example.com/data.json", {
    method: "GET",
    headers: { Accept: "application/json" },
    maxResponseBytes: 250_000,
});
const data = await response.json();
```

Requires `network:fetch` and `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true` in `.env`. The server bridge allows HTTPS only, blocks loopback/private/reserved destinations through `safe-fetch.ts`, rechecks redirects, filters unsafe headers, and caps response size.

Supported options:

- `method`: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. Defaults to `GET`.
- `headers`: string header values. Unsafe headers such as `cookie`, `host`, `origin`, `referer`, and SmileyChat CSRF headers are dropped by the server.
- `body`: string request body. `GET` requests cannot include a body. Request bodies are capped at 1 MiB.
- `maxResponseBytes`: response size cap from 1 byte through 10 MiB. Defaults to 10 MiB.

The returned `Response` contains the upstream status and filtered response headers. Unsafe response headers such as `set-cookie`, `content-length`, and transfer headers are removed.

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

## `api.ui.registerSidebarPanel`

Adds a custom panel to the left or right sidebar.

```js
api.ui.registerSidebarPanel({
    id: "lorebook",
    label: "Lorebook",
    side: "right",
    render: ({ snapshot }) =>
        api.ui.h("p", null, `Active character: ${snapshot.character.data.name}`),
});
```

Requires `ui:sidebar`.

## `api.ui.registerMessageRenderer`

Overrides message content rendering.

```js
api.ui.registerMessageRenderer({
    id: "plain-uppercase",
    priority: 10,
    render: ({ content }) => api.ui.h("p", null, content.toUpperCase()),
});
```

Higher priority renderers run first. SmileyChat currently uses the highest-priority renderer.
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

## `api.ui.registerComposerOption`

Adds items to the composer options menu.

```js
api.ui.registerComposerOption({
    id: "insert-scene-break",
    label: "Scene break",
    renderIcon: () => api.ui.h("span", { "aria-hidden": "true" }, "+"),
    run: ({ insertText }) => {
        insertText("\n\n---\n\n");
    },
});
```

Context matches `registerComposerAction`:

- `draft`
- `setDraft`
- `insertText`
- `submit`
- `snapshot`

Requires `ui:composer`.

## `api.ui.setComposerState`

Overrides the composer UI while the plugin is active.

```js
api.ui.setComposerState({
    disabled: true,
    placeholder: "Character is offline...",
});
```

Supported fields:

- `disabled`: disables message entry and sending when `true`.
- `placeholder`: replaces the composer placeholder text.

Composer state is runtime-only, scoped to the plugin, and cleared when the plugin is deactivated. If multiple plugins set composer state, any `disabled: true` disables the composer and the latest active placeholder wins.

Requires `ui:composer-state`.

## `api.ui.registerHeaderAction`

Adds a compact action button to the chat header.

```js
api.ui.registerHeaderAction({
    id: "open-lore",
    label: "Open lore",
    run: () => {
        api.ui.openModal({
            id: "lore-modal",
            title: "Lore",
            render: ({ close }) =>
                api.ui.h("button", { type: "button", onClick: close }, "Close"),
        });
    },
});
```

Requires `ui:header`. If the action opens a modal, the plugin also needs `ui:modals`.

## `api.ui.openModal`

Opens an app-hosted plugin modal. The returned function closes that modal.

```js
const close = api.ui.openModal({
    id: "custom-dialog",
    title: "Custom Dialog",
    render: ({ close, snapshot }) =>
        api.ui.h("section", null, [
            api.ui.h("p", null, snapshot?.character.data.name ?? "No snapshot"),
            api.ui.h("button", { type: "button", onClick: close }, "Done"),
        ]),
});
```

Requires `ui:modals`.

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

## `api.chat.registerPromptContextMiddleware`

Runs before prompt budgeting and preset compilation. This is for trusted extensions that
need to adjust the structured prompt build context before history trimming.

```js
api.chat.registerPromptContextMiddleware((context) => ({
    ...context,
    messages: context.messages.slice(-20),
}));
```

Requires `chat:prompt-context`.

## `api.chat.registerPromptInjector`

Registers structured prompt injections before history budgeting. Injections are counted
against the active context budget unless `tokenBudgetBehavior` is set to
`"ignore-budget"`.

```js
api.chat.registerPromptInjector(() => [
    {
        id: "example-lore",
        source: "plugin",
        role: "system",
        content: "The city is built under glass.",
        anchor: "before-history",
        order: 100,
    },
]);
```

Requires `chat:prompt-inject`.

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

Adds a connection provider without editing SmileyChat source.

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

Storage can also be snapshotted by SmileyChat's plugin profile UI. Profile application may overwrite a plugin's storage with a saved snapshot, then reload the plugin if it is enabled.

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

## Local Plugin API Routes

These routes are used by the app and plugin runtime:

- `GET /api/plugins`: discover bundled core extensions and installed local plugin manifests.
- `PUT /api/plugins/{pluginId}`: enable or disable one plugin.
- `GET /api/plugins/registry`: load the verified extension registry.
- `POST /api/plugins/install`: install one registry plugin with `{ "pluginId": "..." }`, or install one manual HTTPS ZIP artifact with `{ "artifactUrl": "..." }` when `SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true`.
- `POST /api/plugins/{pluginId}/update`: update a plugin installed by SmileyChat using `smileychat-install.json`.
- `POST /api/plugins/fetch`: SSRF-guarded outbound fetch for trusted local plugins with `network:fetch`, gated by `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true`.
- `GET /api/plugins/profiles`: load plugin profile state plus built-in profile definitions.
- `PUT /api/plugins/profiles`: save plugin profile state.
- `DELETE /api/plugins/profiles/{profileId}`: delete a user plugin profile.
- `GET /api/plugins/{pluginId}/storage`: load a full plugin-owned JSON storage snapshot.
- `PUT /api/plugins/{pluginId}/storage`: replace a full plugin-owned JSON storage snapshot.
- `GET /api/plugins/{pluginId}/storage/{key}`: load one plugin-owned JSON value.
- `PUT /api/plugins/{pluginId}/storage/{key}`: save one plugin-owned JSON value.
- `DELETE /api/plugins/{pluginId}/storage/{key}`: delete one plugin-owned JSON value.

Provider calls should still go directly from the frontend to the configured provider URL. Do not add local API proxy routes for provider model listing or generation unless the project direction changes.
