# How to Connect AI Models

SmileyChat uses connection profiles to manage AI backends. You can create multiple profiles, name them, and switch between them without changing your chats or presets.

Open Options from the gear icon in the bottom-left persona bar, then choose **Connections**.

## 1. Local AI Tools

Use the **OpenAI-compatible** provider type for local tools that expose an OpenAI-style API.

1. Click **New Profile**.
2. Choose **OpenAI-compatible**.
3. Name the profile, such as `Local LM Studio`.
4. Set the **Base URL** for your tool:
   - **LM Studio:** `http://127.0.0.1:1234/v1`
   - **Ollama:** `http://127.0.0.1:11434/v1`
   - **KoboldCpp:** `http://127.0.0.1:5001/v1`
   - **text-generation-webui:** `http://127.0.0.1:5000/v1`
5. Click **Load Models**.
6. Select a model from the dropdown, or enter a custom model name.
7. Click **Test Connection**.
8. Click **Save**.

If model loading fails but you know the model ID, enter it manually and use **Test Connection**.

## 2. OpenRouter

Use **OpenRouter** when you want OpenRouter's model catalog and routing controls.

1. Click **New Profile**.
2. Choose **OpenRouter**.
3. Enter your **OpenRouter API key**.
4. Click **Load Models**.
5. Select the model you want to use.
6. Adjust routing preferences if needed.
7. Click **Test Connection**.
8. Click **Save**.

## 3. Google AI / Gemini

Use **Google AI** to connect directly to Gemini models.

1. Click **New Profile**.
2. Choose **Google AI**.
3. Enter your **Google AI API key** from Google AI Studio.
4. Keep the default base URL unless you know you need another one.
5. Click **Load Models**.
6. Select a model, such as `gemini-3.1-flash-lite`.
7. Click **Test Connection**.
8. Click **Save**.

## 4. Anthropic / Claude

Use **Anthropic** to connect directly to Claude through Anthropic's Messages API.

1. Click **New Profile**.
2. Choose **Anthropic**.
3. Enter your **Anthropic API key**.
4. Keep the default base URL unless you know you need another one.
5. Click **Load Models**.
6. Select a Claude model, such as `claude-sonnet-4-6`.
7. Click **Test Connection**.
8. Click **Save**.

Anthropic browser calls use Anthropic's direct browser access header because SmileyChat is a local BYO-key app that calls providers directly from the frontend.

## 5. Other Cloud APIs

For cloud APIs that use the standard OpenAI Chat Completions format:

1. Click **New Profile**.
2. Choose **OpenAI-compatible**.
3. Enter the provider's **Base URL**, such as `https://api.groq.com/openai/v1`.
4. Enter your **API key**.
5. Load models or enter a custom model ID.
6. Click **Test Connection**.
7. Click **Save**.

## Connection vs. Preset

Connections decide where requests go and which model is used. Presets decide how the prompt is structured and which generation settings are sent.

For implementation details, see [Providers & AI Setup](../reference/providers.md).
