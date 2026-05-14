# AI Providers & Connections

SmileyChat uses a generalized "Connection Adapter" system to communicate with various AI backends. Currently, it focuses heavily on an **OpenAI-Compatible** adapter because most local and cloud LLM tools support this standard.

## Supported Configurations

By using the **OpenAI-Compatible** provider connection, you can connect to:

### 1. Local AI Tools

- **LMStudio**: Start the local server in LMStudio. Set your base URL in SmileyChat to `http://localhost:1234/v1`.
- **Ollama**: Start Ollama. Set your base URL to `http://localhost:11434/v1` (Note: Ensure Ollama is configured to accept cross-origin requests or OpenAI compat layer).
- **text-generation-webui (Oobabooga)**: Enable the `openai` extension. Set the base URL to `http://127.0.0.1:5000/v1`.
- **KoboldCpp**: Run with `--openai` flag and set base URL to `http://localhost:5001/v1`.

### 2. Cloud AI APIs

- **OpenRouter**: Set base URL to `https://openrouter.ai/api/v1` and provide your OpenRouter API key.
- **Groq**: Set base URL to `https://api.groq.com/openai/v1` and provide your Groq API key.
- **OpenAI**: Set base URL to `https://api.openai.com/v1`.

## Profile System

Connections are stored as **Profiles**. You can create multiple profiles (e.g., "Local LMStudio", "Fast Cloud Groq", "Smart OpenRouter") and switch between them instantly from the Settings or Persona menu.

_Note: Generation behaviors like `temperature`, `top_p`, or `max_tokens` are saved within **Presets**, not Connections. Connections are strictly for routing, URLs, and authentication._
