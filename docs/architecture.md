# Core Architecture

ScyllaChat's architecture separates the UI, the state orchestration, the text generation, and the file persistence.

## Flow of a Chat Message

1. **Input**: User types in `MessageComposer`.
2. **Middlewares (Input)**: Before adding to the chat, the raw text goes through input middlewares (from plugins or core extensions).
3. **State Update**: The chat session updates. A temporary "pending" state locks the generation.
4. **Preset Compilation**: The `compilePresetMessages` function processes the `Preset`. It evaluates macros (`{{char}}`, `{{user}}`, etc.) and orders the prompts (System, Lore, History, etc.) according to the preset configuration.
5. **Middlewares (Prompt)**: The compiled context array is passed to prompt middlewares, allowing plugins to inject or mutate the AI prompt right before generation.
6. **Adapter Generation**: The context is sent to the configured `ConnectionAdapter` (e.g., OpenAI-compatible, OpenRouter, or Google AI). The adapter is responsible for handling the HTTP request. Streaming is enabled by default and updates the pending character message as SSE chunks arrive; the app-level Settings panel can disable streaming globally.
7. **Middlewares (Output)**: The raw AI response is filtered through output middlewares.
8. **Save**: The final message is appended to the chat, and the Bun server saves the JSON state to `userData/chats/`.

## The Connection Adapter

Adapters are defined in `src/lib/connections/`. The goal is that the frontend UI should never know if it's talking to OpenAI, Anthropic, or a local model.
The adapter normalizes the generation request and returns a standardized response format.

## Plugins

ScyllaChat is highly extensible via plugins loaded dynamically from `userData/plugins/`. Plugins are executed securely as local ESM browser modules. For more information, see the [Plugins Docs](plugins/README.md).
