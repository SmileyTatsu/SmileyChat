# AI Providers & Connections

SmileyChat uses connection profiles to talk to AI providers. Each profile has a stable internal ID, an editable display name, one provider type, non-secret settings in `userData/settings/connections.json`, and secrets in `userData/settings/connection-secrets.json`.

Generation behavior such as temperature, top-p, top-k, max output tokens, and penalties belongs to presets, not connections. Connections are for routing, model selection, provider-specific options, and authentication.

## Built-In Providers

SmileyChat currently includes these provider adapters:

- **OpenAI-compatible**: Local or hosted APIs that expose Chat Completions-style endpoints.
- **OpenRouter**: OpenRouter-specific model catalog, app attribution, and provider routing controls.
- **Google AI**: Direct browser calls to the Gemini API.
- **Anthropic**: Direct browser calls to the Claude Messages API.
- **NovelAI**: Direct browser calls to NovelAI's OpenAI-compatible completions endpoint.

Provider calls are made directly from the frontend to the configured provider URL. SmileyChat intentionally does not proxy normal provider model listing or generation calls through the local Bun API.

## OpenAI-compatible APIs

Use the OpenAI-compatible provider for local AI tools or hosted APIs that support OpenAI-style `GET /models` and `POST /chat/completions` endpoints.

Common examples:

- **LM Studio**: `http://127.0.0.1:1234/v1`
- **Ollama**: `http://127.0.0.1:11434/v1`
- **text-generation-webui / Oobabooga**: `http://127.0.0.1:5000/v1`
- **KoboldCpp**: `http://127.0.0.1:5001/v1`
- **Groq**: `https://api.groq.com/openai/v1`
- **OpenAI**: `https://api.openai.com/v1`

The provider sends `model` and ordered chat-completion `messages`, then normalizes the first assistant message from `choices`.

Model selection starts with the local default catalog in `src/data/default-openai-models.json`. Models loaded from `GET {baseUrl}/models` are shown under `Other`, and a custom model field remains available for endpoints that require manual IDs.

## OpenRouter

Use the OpenRouter provider when you want OpenRouter's model catalog and routing controls instead of treating it as a generic OpenAI-compatible endpoint.

OpenRouter requests use:

- Model loading: `GET https://openrouter.ai/api/v1/models`
- Generation: `POST https://openrouter.ai/api/v1/chat/completions`

SmileyChat sends fixed OpenRouter app attribution headers:

- `HTTP-Referer`: `https://github.com/SmileyTatsu/SmileyChat`
- `X-OpenRouter-Title`: `SmileyChat`
- `X-OpenRouter-Categories`: `roleplay,creative-writing,general-chat`

The OpenRouter profile can store routing preferences such as `sort`, `allow_fallbacks`, `require_parameters`, `data_collection`, `zdr`, `order`, `only`, and `ignore`.

## Google AI

Use the Google AI provider to access Gemini models directly through the browser.

Defaults and endpoints:

- Base URL: `https://generativelanguage.googleapis.com/v1beta`
- Default model: `gemini-3.1-flash-lite`
- Model loading: `GET {baseUrl}/models?key={apiKey}`
- Generation: `POST {baseUrl}/models/{model}:generateContent?key={apiKey}`
- Streaming generation: `POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={apiKey}`

System and developer prompts are sent through `systemInstruction`. User and assistant history is converted to Google `contents` with `user` / `model` roles, and consecutive same-role turns are merged.

Model selection starts with the local default catalog in `src/data/default-google-ai-models.json`. Models loaded from the endpoint are shown under `Other`.

## Anthropic

Use the Anthropic provider to access Claude through Anthropic's Messages API directly from the browser.

Defaults and endpoints:

- Base URL: `https://api.anthropic.com/v1`
- Default model: `claude-sonnet-4-6`
- Model loading: `GET {baseUrl}/models`
- Generation: `POST {baseUrl}/messages`

Browser requests include:

- `anthropic-version: 2023-06-01`
- `anthropic-dangerous-direct-browser-access: true`

System and developer prompts are joined into the top-level Anthropic `system` field. User and assistant history is converted to Anthropic Messages API turns, and consecutive same-role turns are merged.

## NovelAI

Use the NovelAI provider to access NovelAI models natively without relying on generic OpenAI-compatible routing.

Defaults and endpoints:

- Default model: `llama-3-erato-v1`
- Generation: `POST {baseUrl}/oa/v1/chat/completions`

Base URL routing is handled dynamically based on the selected model:

- `xialong-v1` and `glm-4-6` map to `https://text.novelai.net`
- `llama-3-erato-v1`, `kayra-v1`, `clio-v1`, and custom models map to `https://api.novelai.net`

SmileyChat utilizes the NovelAI `/oa/v1/chat/completions` endpoint instead of the raw text endpoint so that instruct formatting templates are automatically applied by the NovelAI backend. The provider implementation also includes magic `logit_bias` arrays for Erato and Kayra to ban unwanted artifacts like dinkus and asterisms automatically.

## Streaming

OpenAI-compatible, OpenRouter, Google AI, Anthropic, and NovelAI adapters support streaming over SSE. Streaming is enabled by default through the app-level preference `preferences.chat.streaming` and can be disabled in Options > Settings.

Streaming is intentionally not a per-provider setting.

## Secrets

API keys are stored separately from normal connection settings:

- Public connection settings: `userData/settings/connections.json`
- API keys and secrets: `userData/settings/connection-secrets.json`

`connection-secrets.json` is local user data. It is separated to avoid accidental export with normal connection settings, but it is not encrypted at rest.
