# Development Guide

SmileyChat is a local-first app built with Vite, Preact, TypeScript, and Bun.

Use this page for day-to-day development commands and project orientation. Product direction and working rules live in `AGENTS.md`.

## Tech Stack

- **Frontend**: Vite, Preact, TypeScript, Tailwind CSS, and targeted Preact signals for app-level reactive state.
- **Backend/runtime**: Bun. The Bun server exposes local JSON APIs, serves built frontend assets, and prepares `userData/`.
- **Persistence**: File-backed JSON under `userData/`.
- **Plugins**: Trusted local browser ESM modules loaded from `userData/plugins/`, plus bundled core extensions in `src/core-extensions/`.

## Project Structure

- `src/app/`: The app shell, state orchestration, layout, and app-host integration.
- `src/features/`: UI components organized by feature area, such as chat, characters, personas, settings, plugins, and sidebar.
- `src/lib/`: Core logic that does not directly depend on UI. This includes API clients, normalizers, preset compilation, provider adapters, plugin runtime code, and storage types.
- `src/core-extensions/`: Built-in features implemented through the plugin API format.
- `src/data/`: Default static data, such as model catalogs and default characters.
- `src/styles/`: Shared styling entry points.
- `server/`: Bun server routes and filesystem persistence.
- `scripts/`: Windows and Termux launcher/update scripts.
- `docs/`: User guides, reference docs, plugin docs, and development notes.

## Running in Dev Mode

Run the frontend dev server:

```bash
bun run dev
```

In a second terminal, start the local API server:

```bash
bun run dev:api
```

The production-style local server is:

```bash
bun run build
bun run start
```

## Checks

Run these before shipping a meaningful change:

```bash
bun run typecheck
bun test
bun run build
```

Use `bun run typecheck` for fast TypeScript validation, `bun test` for unit tests, and `bun run build` to verify the delivered frontend bundle.

## Development Rules

1. Keep core persistence in `userData/`; do not move product data into browser storage.
2. Keep API keys in `userData/settings/connection-secrets.json`, separate from normal connection settings.
3. Do not add local API proxy routes for provider calls unless that is explicitly requested.
4. Prefer small feature components over growing `src/app/App.tsx`.
5. Keep the app dark-mode-only until the product direction changes.
6. User-facing controls should work end-to-end or show a clear unavailable/error state.

## Where to Add Code

- Chat UI changes usually start in `src/features/chat/`.
- Character panel work belongs in `src/features/characters/`.
- Persona UI belongs in `src/features/personas/`.
- Options and provider settings belong in `src/features/settings/`.
- Provider request/response behavior belongs in `src/lib/connections/`.
- Preset compilation, macros, and prompt injection belong in `src/lib/presets/` and `src/lib/prompt/`.
- Server persistence routes belong in `server/`.
- Plugin API additions should be typed and documented under `src/lib/plugins/` and `docs/plugins/`.

## Documentation

When behavior changes, update the nearest relevant doc:

- User workflows: `docs/guides/`
- Provider behavior: `docs/reference/providers.md`
- Storage shape: `docs/reference/user-data.md`
- Security behavior: `docs/reference/security.md`
- Plugin APIs: `docs/plugins/`
- Architecture notes: `docs/development/architecture.md`
