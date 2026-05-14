# Development Guide

SmileyChat is built to be lightweight, modern, and easily maintainable.

## Tech Stack

- **Frontend**: [Vite](https://vitejs.dev/) + [Preact](https://preactjs.com/) + TypeScript. (Preact is used over React for a lighter bundle footprint while maintaining the same component paradigm).
- **Backend**: [Bun](https://bun.sh/). A lightweight server handles the local API, reading/writing JSON files, and serving the built frontend assets.

## Project Structure

- `src/app/`: The core application shell (`App.tsx`), layout, and high-level hooks (`useChatSession.ts`, `useCharacterChats.ts`).
- `src/features/`: UI components organized by domain (`chat`, `characters`, `personas`, `settings`, `sidebar`).
- `src/lib/`: Core logic that doesn't depend directly on UI. Includes API client, normalizers, preset compilation, and plugin registries.
- `src/core-extensions/`: Built-in features using the plugin API format (e.g., chat formatters).
- `server/`: The Bun backend API. Handles file system operations (`userData/`) and serves static files.

## Development Rules

1. **Keep it Local**: Treat the app as a desktop application running in a browser. Avoid heavy cloud dependencies.
2. **State Management**: Prefer local state and context over heavy global stores unless absolutely necessary. Be mindful of React/Preact re-renders. Keep active input states (like text fields) isolated to their components.
3. **Design**: The app currently targets **Dark Mode only** to reduce initial UI complexity. Focus on a clean, unobtrusive interface.
4. **Safety**: Never log or print API keys. Keep all keys within `connection-secrets.json`.

## Running in Dev Mode

To get Hot Module Replacement (HMR) for the frontend, run:

```bash
bun run dev
```

In a second terminal, start the local API server:

```bash
bun run dev:api
```
