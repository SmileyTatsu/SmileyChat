# Troubleshooting

This page covers common desktop and browser issues. For Android-specific issues, see [Running SmileyChat on Android via Termux](../android-termux.md).

## The App Will Not Start

Make sure Bun is installed and available in your terminal:

```bash
bun --version
```

From the SmileyChat folder, rebuild and start:

```bash
bun install
bun run build
bun run start
```

If dependency installation fails, update Bun and try again.

## Port 4173 Is Already in Use

Another process is already using SmileyChat's default port.

Close the other process, or set a different port in `.env`:

```env
SMILEYCHAT_PORT=4174
```

Restart SmileyChat after changing the port.

## Browser Shows the Remote Access Setup Page

SmileyChat binds to `0.0.0.0` by default but blocks non-loopback access until you configure access.

For another device on your LAN, set one of these in `.env`:

```env
SMILEYCHAT_BASIC_AUTH_USER=your-name
SMILEYCHAT_BASIC_AUTH_PASS=your-password
```

or:

```env
SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true
```

For details, see [How to Access SmileyChat Remotely](remote-access.md) and [Security Model](../reference/security.md).

## Load Models Fails

Check these first:

- The provider server is running.
- The base URL includes the API version when required, such as `/v1`.
- The API key is correct.
- The provider allows browser requests from SmileyChat.
- Local providers such as Ollama or text-generation-webui are configured for OpenAI-compatible access.

If model listing is unavailable, enter the model ID manually and use **Test Connection**.

## Test Connection Fails

The model list can load even when generation fails. Check:

- The selected model ID is valid for the provider.
- Your account has access to that model.
- The API key has enough credit or quota.
- The provider supports the request shape used by the selected provider type.

For Anthropic, use the Anthropic provider instead of OpenAI-compatible. For OpenRouter, use the OpenRouter provider when you need OpenRouter routing controls.

## Local Provider CORS Errors

SmileyChat calls providers directly from the browser. Some local AI tools require a setting or launch flag to allow browser requests.

Typical fixes:

- LM Studio: enable the local server and allow local network/API access as needed.
- Ollama: configure allowed origins for browser access.
- text-generation-webui: enable the OpenAI extension.
- KoboldCpp: start with OpenAI-compatible API support.

## Changes to `.env` Do Not Apply

Most security settings hot-reload within about 2 seconds. If a setting still does not apply:

1. Save the `.env` file again.
2. Check for typos in the variable name.
3. Restart SmileyChat.

## Data Looks Missing

SmileyChat reads data from the local `userData/` folder in the current checkout.

Check that you started SmileyChat from the expected project folder and that your backup was restored into that folder's `userData/` directory.
