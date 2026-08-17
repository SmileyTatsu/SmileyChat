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

## SmileyChat Does Not Open a Browser Tab

The server normally opens `http://127.0.0.1:4173` in your default browser once
it is ready. If you disabled that behavior for a headless launch, remove this
setting from `.env` or set it to `true`:

```env
SMILEYCHAT_OPEN_BROWSER=true
```

You can always open the URL printed by the server yourself.

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

## Checking Logs & Diagnostics

If you encounter unexpected errors, connection failures, or plugin crashes:

1. Open **Options** (gear icon in the bottom-left persona bar) and select **Diagnostics**.
2. View real-time streaming logs from the Bun server and frontend extensions.
3. Use the search input or toggle subsystem and severity level pills (`generate`, `http`, `plugins`, `mcp`, `server`, `security`) to isolate relevant events.
4. Click **Export Logs** to save a snapshot of current logs for bug reports.

Server log files are also saved locally to `userData/logs/smileychat-YYYY-MM-DD.log`.

To increase logging verbosity during debugging, set `SMILEYCHAT_LOG_LEVEL=debug` (or `trace`) in `.env` or adjust the Log Level in the Diagnostics settings card. Sensitive prompts and payloads can be inspected by setting `SMILEYCHAT_LOG_SENSITIVE_PAYLOADS=true` in `.env` (kept disabled by default to protect privacy).
