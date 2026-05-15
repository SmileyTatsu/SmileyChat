# AI Providers & Connections

SmileyChat uses a generalized "Connection Adapter" system to communicate with various AI backends. The built-in providers are **OpenAI-Compatible** for local and compatible APIs, **OpenRouter** for OpenRouter-specific model routing, and **Google AI** for Gemini API direct browser calls.

## Supported Configurations

By using the **OpenAI-Compatible** provider connection, you can connect to:

### 1. Local AI Tools

- **LMStudio**: Start the local server in LMStudio. Set your base URL in SmileyChat to `http://localhost:1234/v1`.
- **Ollama**: Start Ollama. Set your base URL to `http://localhost:11434/v1` (Note: Ensure Ollama is configured to accept cross-origin requests or OpenAI compat layer).
- **text-generation-webui (Oobabooga)**: Enable the `openai` extension. Set the base URL to `http://127.0.0.1:5000/v1`.
- **KoboldCpp**: Run with `--openai` flag and set base URL to `http://localhost:5001/v1`.

### 2. Cloud AI APIs

- **Groq**: Set base URL to `https://api.groq.com/openai/v1` and provide your Groq API key.
- **OpenAI**: Set base URL to `https://api.openai.com/v1`.

### 3. OpenRouter

Use the **OpenRouter** provider when you want OpenRouter's model catalog and routing controls instead of a generic compatible endpoint.

The OpenRouter provider stores:

- API key in `userData/settings/connection-secrets.json`.
- Model selection in `userData/settings/connections.json`.
- Provider routing preferences such as priority, fallbacks, data collection policy, ZDR, and provider order/allow/ignore lists.

OpenRouter requests are sent directly from the frontend to `https://openrouter.ai/api/v1/chat/completions`. Model loading uses `https://openrouter.ai/api/v1/models`.

SmileyChat sends fixed OpenRouter app attribution headers:

- `HTTP-Referer`: `https://github.com/SmileyTatsu/SmileyChat`
- `X-OpenRouter-Title`: `SmileyChat`
- `X-OpenRouter-Categories`: `roleplay,creative-writing,general-chat`

OpenAI-compatible, OpenRouter, and Google AI chat requests stream by default. Users can disable streaming globally in Options -> Settings; the preference is app-level, not per provider.

### 4. Google AI (Gemini)

Use the **Google AI** provider to access Google's Gemini models directly via the browser.

The Google AI provider:

- Defaults to `https://generativelanguage.googleapis.com/v1beta`.
- Uses `gemini-3.1-flash-lite` as the default model.
- Loads models from `GET {baseUrl}/models?key={apiKey}`.
- Sends generation requests to `POST {baseUrl}/models/{model}:generateContent?key={apiKey}` or `:streamGenerateContent?alt=sse&key={apiKey}`.
- Maps system and developer prompts to `systemInstruction`.
- Converts user and assistant history to Google `contents` with `user` / `model` roles, merging consecutive same-role turns.

## Profile System

Connections are stored as **Profiles**. You can create multiple profiles (e.g., "Local LMStudio", "Fast Cloud Groq", "Smart OpenRouter") and switch between them instantly from the Settings or Persona menu.

_Note: Generation behaviors like `temperature`, `top_p`, or `max_tokens` are saved within **Presets**, not Connections. Connections are strictly for routing, URLs, and authentication._
