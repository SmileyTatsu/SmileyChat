# Core Architecture

SmileyChat's architecture separates the UI, the state orchestration, the text generation, and the file persistence.

## Flow of a Chat Message

1. **Input**: User types in `MessageComposer`.
2. **Middlewares (Input)**: Before adding to the chat, the raw text goes through input middlewares (from plugins or core extensions).
3. **State Update**: The chat session updates. A temporary "pending" state locks the generation.
4. **Preset Compilation**: The `compilePresetMessages` function processes the `Preset`. It evaluates macros (`{{char}}`, `{{user}}`, etc.) and orders the prompts (System, Lore, History, etc.) according to the preset configuration.
5. **Middlewares (Prompt)**: The compiled context array is passed to prompt middlewares, allowing plugins to inject or mutate the AI prompt right before generation.
6. **Adapter Generation**: The context is sent to the configured `ConnectionAdapter` (for example OpenAI-compatible, OpenRouter, Google AI, Anthropic, NovelAI, or xAI). The adapter is responsible for handling the HTTP request. Streaming updates the pending character message as SSE chunks arrive; the active preset can enable or disable it, while presets without an override use the legacy global preference.
7. **Middlewares (Output)**: The raw AI response is filtered through output middlewares.
8. **Save**: The final message is appended to the chat, and the Bun server saves the JSON state to `userData/chats/`.

## The Connection Adapter

Adapters are defined in `src/lib/connections/`. The goal is that the frontend UI should never know if it's talking to OpenAI, Anthropic, or a local model.
The adapter normalizes the generation request and returns a standardized response format. All provider communication goes through the frontend directly (for testing/development connections) or through the local Bun proxy server (for normal chat operations using the `/api/generate` endpoint).

## Local Chat Assets & Management

Chat image attachments are written to `userData/chats/assets/{chatId}` and served through `/api/chats/{chatId}/attachments/{file}`. The server also exposes `DELETE /api/chats/{chatId}/attachments/{file}` for explicit cleanup, and chat deletion removes the full per-chat asset directory.

Group chat definitions can be exported through `/api/chats/{chatId}/export-group.json` and imported through `/api/chats/import-group`. These routes move room setup data only; message history remains in normal chat session files.

Chats can also be forked at specific messages via `/api/chats/{chatId}/fork`.

## Plugins and Core Extensions

SmileyChat is highly extensible via plugins loaded dynamically from `userData/plugins/`. Plugins are trusted local browser ESM modules that run in the SmileyChat page, so permissions guide API access but are not a sandbox.

In addition to user plugins, SmileyChat bundles several **Core Extensions** (e.g. MCP Servers, LoreBooks, Formatting, Regex Replacer) which act internally like plugins but are part of the core distribution. For more information, see the [Plugins Docs](../plugins/README.md).
