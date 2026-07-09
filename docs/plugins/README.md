# SmileyChat Plugins

SmileyChat plugins are trusted local browser ESM modules loaded from `userData/plugins`.
Core extensions are bundled with the app and use the same runtime API. Both extend the app without patching SmileyChat source files.

Start here:

1. Read [quick-start.md](quick-start.md).
2. Copy one of the examples from [examples.md](examples.md).
3. Use [plugin-development.md](plugin-development.md) when turning an idea into a complete plugin.
4. Use [distribution.md](distribution.md) when packaging a plugin for the verified extension registry.
5. Use [api-reference.md](api-reference.md) when you need a specific hook.

Current plugin surfaces:

- Options > Plugins list and per-plugin configuration.
- Plugin profiles for switching sets of enabled plugins and saved plugin configuration.
- Message rendering and message actions.
- Composer actions.
- Runtime composer state controls.
- Programmatic app actions.
- Custom model requests, including background connection profile targeting.
- Model token estimation and context-budget lookup for plugin-managed trimming.
- Guarded outbound network fetch through the local server.
- Sidebar panels, header actions, and app-hosted modals.
- Chat input, prompt, and output middleware.
- Runtime character presence and direct message injection.
- Custom preset macros.
- Connection provider registration.
- Plugin-owned JSON storage.

Plugin API permissions are runtime declarations checked by most protected hooks. A plugin that calls a protected API without the matching manifest permission fails to load or fails when that API is called, but plugins are trusted local code and are not sandboxed.

## Plugin Profiles

Options > Plugins includes a profile selector. The built-in **Default** profile keeps plugins at their installed defaults. Users can create, duplicate, edit, and delete their own profiles.

User profiles store:

- Which plugins should be enabled.
- Optional per-plugin storage snapshots.
- Optional category defaults for plugins not listed by ID.

Applying a profile writes plugin enabled states, restores stored plugin JSON snapshots where present, and reloads affected enabled plugins in the current browser session. Profile metadata is stored in `userData/settings/plugin-profiles.json`; plugin-owned settings remain in each plugin's storage folder.
