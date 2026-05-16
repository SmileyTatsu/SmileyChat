# SmileyChat Plugins

SmileyChat plugins are trusted local browser ESM modules loaded from `userData/plugins`.
Core extensions are bundled with the app and use the same runtime API. Both extend the app without patching SmileyChat source files.

Start here:

1. Read [quick-start.md](quick-start.md).
2. Copy one of the examples from [examples.md](examples.md).
3. Use [api-reference.md](api-reference.md) when you need a specific hook.

Current plugin surfaces:

- Options > Plugins list and per-plugin configuration.
- Message rendering and message actions.
- Composer actions.
- Programmatic app actions.
- Guarded outbound network fetch through the local server.
- Sidebar panels, header actions, and app-hosted modals.
- Chat input, prompt, and output middleware.
- Custom preset macros.
- Connection provider registration.
- Plugin-owned JSON storage.

Plugin API permissions are enforced by the runtime for most hooks. A plugin that calls a protected API without the matching manifest permission fails to load or fails when that API is called.
