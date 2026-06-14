# How to Connect AI Models

SmileyChat uses a "Connection Profile" system to manage your AI backends. You can create multiple profiles and switch between them instantly.

Here is how to connect the most common AI providers.

## 1. Local AI Tools (LMStudio, Ollama, KoboldCpp)

To connect to an AI running on your own computer, you will use the **OpenAI-Compatible** provider type.

1. Go to **Settings** (click the gear icon on the bottom left Persona bar) -> **Connections**.
2. Click **New Profile** and choose **OpenAI-Compatible**.
3. Name it (e.g., "My LMStudio").
4. Set the **Base URL** depending on your tool:
   - **LMStudio:** `http://127.0.0.1:1234/v1`
   - **Ollama:** `http://127.0.0.1:11434/v1`
   - **KoboldCpp:** `http://127.0.0.1:5001/v1`
   - **text-generation-webui:** `http://127.0.0.1:5000/v1`
5. Click **Load Models** to test the connection. If successful, select your model from the dropdown.
6. Click **Save**.

## 2. OpenRouter

OpenRouter gives you access to hundreds of models via a single API key.

1. Go to **Settings** -> **Connections**.
2. Click **New Profile** and choose **OpenRouter**.
3. Enter your **OpenRouter API Key**.
4. Click **Load Models** and select the model you want to use.
5. Click **Save**.

## 3. Google AI (Gemini)

You can connect directly to Google's Gemini models.

1. Go to **Settings** -> **Connections**.
2. Click **New Profile** and choose **Google AI**.
3. Enter your **Google AI API Key** (from Google AI Studio).
4. Click **Load Models** and select a model (e.g., `gemini-3.1-flash-lite`).
5. Click **Save**.

## 4. Cloud APIs (OpenAI, Groq, etc.)

For other cloud APIs that use the standard OpenAI format:

1. Go to **Settings** -> **Connections**.
2. Create an **OpenAI-Compatible** profile.
3. Enter the specific **Base URL** (e.g., `https://api.groq.com/openai/v1`).
4. Enter your **API Key**.
5. Load models and Save.
