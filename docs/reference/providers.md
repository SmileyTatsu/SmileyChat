# AI Providers & Connections

SmileyChat uses connection profiles to talk to AI providers. Each profile has a stable internal ID, an editable display name, one provider type, non-secret settings in `userData/settings/connections.json`, and secrets in `userData/settings/connection-secrets.json`.

Generation behavior such as temperature, top-p, top-k, max output tokens, and penalties belongs to presets, not connections. Connections are for routing, model selection, provider-specific options, and authentication.

## Built-In Providers

SmileyChat currently includes these provider adapters:

- **OpenAI-compatible**: Local or hosted APIs that expose Chat Completions-style endpoints.
- **OpenRouter**: OpenRouter-specific model catalog, app attribution, and provider routing controls.
- **Google AI**: Direct browser calls to the Gemini API.
- **Anthropic**: Direct browser calls to the Claude Messages API.
- **NovelAI**: Direct generation calls to NovelAI's generation API or compatible Chat Completions API.
- **xAI**: Direct browser calls to the Grok Chat Completions API.

Chat generation and model discovery are sent through the local Bun server using a saved connection profile (via `/api/generate`). This lets remote devices use the PC's configured providers without receiving provider API keys. The server accepts only a saved profile ID; it is not a general-purpose provider proxy.

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

Model selection starts with the local default catalog in `src/data/default-openai-models.json`. Models loaded from `GET {baseUrl}/models` are shown under `Other` and cached with the connection profile. The cache is replaced when models are loaded again and cleared when the base URL or API key changes. A custom model field remains available for endpoints that require manual IDs.

## OpenRouter

Use the OpenRouter provider when you want OpenRouter's model catalog and routing controls instead of treating it as a generic OpenAI-compatible endpoint.

OpenRouter requests use:

- Model loading: `GET https://openrouter.ai/api/v1/models`
- Generation: `POST https://openrouter.ai/api/v1/chat/completions`

SmileyChat sends fixed OpenRouter app attribution headers:

- `HTTP-Referer`: `https://github.com/SmileyTatsu/SmileyChat`
- `X-OpenRouter-Title`: `SmileyChat`
- `X-OpenRouter-Categories`: `roleplay,creative-writing,general-chat`

The OpenRouter profile can store routing preferences such as `sort`, `allow_fallbacks`, `require_parameters`, `data_collection`, `zdr`, `order`, `only`, and `ignore`. When non-image files are attached, OpenRouter uses Responses-style file input paths.

## Google AI

Use the Google AI provider to access Gemini models directly.

Defaults and endpoints:

- Base URL: `https://generativelanguage.googleapis.com/v1beta`
- Default model: `gemini-3.1-flash-lite`
- Model loading: `GET {baseUrl}/models?key={apiKey}`
- Generation: `POST {baseUrl}/models/{model}:generateContent?key={apiKey}`
- Streaming generation: `POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={apiKey}`

System and developer prompts are sent through `systemInstruction`. User and assistant history is converted to Google `contents` with `user` / `model` roles, and consecutive same-role turns are merged. Non-image files are uploaded to Gemini Files and referenced as `fileData`.

Model selection starts with the local default catalog in `src/data/default-google-ai-models.json`. Models loaded from the endpoint are shown under `Other`.

## Anthropic

Use the Anthropic provider to access Claude through Anthropic's Messages API.

Defaults and endpoints:

- Base URL: `https://api.anthropic.com/v1`
- Default model: `claude-sonnet-4-6`
- Model loading: `GET {baseUrl}/models`
- Generation: `POST {baseUrl}/messages`

Browser requests include:

- `anthropic-version: 2023-06-01`
- `anthropic-dangerous-direct-browser-access: true`

System and developer prompts are joined into the top-level Anthropic `system` field. User and assistant history is converted to Anthropic Messages API turns, and consecutive same-role turns are merged. PDF/plain-text files are uploaded to the Files API and referenced as `document` blocks.

## NovelAI

Use the NovelAI provider to access NovelAI models natively without relying on generic OpenAI-compatible routing.

Defaults and endpoints:

- Base URL: `https://text.novelai.net`
- Default model: `llama-3-erato-v1`
- Text Generation API: `POST {baseUrl}/ai/generate` or `POST {baseUrl}/ai/generate-stream` (used for `llama-3-erato-v1`, `kayra-v1`)
- Chat Completions API: `POST {baseUrl}/oa/v1/chat/completions` (used for `xialong-v1`, `glm-4-6`, and custom model IDs)

SmileyChat utilizes the NovelAI `/oa/v1/chat/completions` endpoint for instruct-based models to ensure instruct formatting templates are automatically applied by the NovelAI backend. For raw text models like Erato or Kayra, it uses the `/ai/generate` API and applies magic `logit_bias` arrays to automatically ban unwanted artifacts like dinkus and asterisms. Small text files are inlined directly into the prompt as NovelAI has no general files API.

## xAI

Use the xAI provider to access Grok directly.

Defaults and endpoints:

- Base URL: `https://api.x.ai/v1`
- Default model: `grok-4.5`
- Model loading: `GET {baseUrl}/models`
- Normal Generation: `POST {baseUrl}/chat/completions`

When non-image files are attached, xAI uploads them with `purpose=assistants` and sends the turn through `POST {baseUrl}/responses`. The panel supports model catalog loading, a custom model ID, max completion tokens, and optional `reasoning_effort` values (`low`, `medium`, and `high`).

## Streaming

OpenAI-compatible, OpenRouter, Google AI, Anthropic, NovelAI, and xAI adapters support streaming over SSE. Streaming is enabled by default through the app-level preference `preferences.chat.streaming` and can be disabled in Options > Settings.

Streaming is intentionally not a per-provider setting.

## Secrets

API keys are stored separately from normal connection settings:

- Public connection settings: `userData/settings/connections.json`
- API keys and secrets: `userData/settings/connection-secrets.json`

`connection-secrets.json` is local user data. It is separated to avoid accidental export with normal connection settings, but it is not encrypted at rest.
