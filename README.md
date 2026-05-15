# ScyllaChat

> ⚠️ **Project Status: Early Pre-Alpha**
> ScyllaChat is currently in a very early stage of development. Please keep in mind that performance is not yet fully optimized, features are still being added, and you may encounter bugs. The core architecture is actively evolving!

ScyllaChat is a local-first frontend application for chatting, roleplay, and storytelling with AI chatbots. Designed to be clean, accessible, and friendly to both casual users and writers.

## Features

- **Dual Visual Modes**: Seamlessly switch between a casual "Chatting" mode (like Discord) and a "Roleplaying / Storytelling" mode designed for reading and writing long scenes.
- **Local Persistence**: All your characters, chats, and personas are saved entirely locally in standard JSON files. No cloud lock-in.
- **Providers**: Connect your favorite local models (LMStudio, Ollama, text-generation-webui) or cloud providers via dedicated adapters (OpenRouter, Google AI / Gemini, OpenAI-Compatible).
- **Character Card Support**: Import Tavern-style V1/V2/V3 JSON and PNG character cards easily via drag & drop or file selection.
- **Extensible Plugin System**: Extend the core functionality using local ESM plugins.

## Requirements

- [Bun](https://bun.sh/) (JavaScript runtime)

## Installation & Usage

1. Clone the repository.
2. Install dependencies:
    ```bash
    bun install
    ```
3. Start the application:
    - On Windows: Run `ScyllaChat.cmd` to automatically build and start the server.
    - On Windows, update first: Run `ScyllaChat.UpdateStart.cmd` to pull the latest Git changes, install dependencies, build, and start the server.
    - Manually:
        ```bash
        bun run build
        bun run start
        ```
4. Open the displayed URL in your browser (default: `http://127.0.0.1:4173`).

## Server Configuration

ScyllaChat protects local data APIs with CSRF tokens and browser origin checks.
For normal local use, no extra configuration is needed. If you run ScyllaChat
behind a reverse proxy or through a LAN hostname, add the public browser origins
that should be allowed to save data:

```bash
SCYLLACHAT_TRUSTED_ORIGINS=https://chat.example.com,http://192.168.1.20:4173
```

Use origins only: scheme, host, and optional port. Do not include paths such as
`/api/chats`.

Private-network origins are auto-trusted without any env entry: when the browser
hits ScyllaChat at a private-LAN address (RFC 1918), a Tailscale CGNAT address
(100.64.0.0/10), an IPv6 unique-local or link-local address, the matching origin
is allowed automatically as long as the request's Host header agrees. Public IPs
and DNS-named hosts still require an explicit `SCYLLACHAT_TRUSTED_ORIGINS` entry.

## Development

To run the app in development mode with Hot Module Replacement (HMR):

```bash
bun run dev
# In a separate terminal, start the local API server:
bun run dev:api
```

## Documentation

Check the [docs/](docs/) folder for deeper technical insights:

- [User Data & Storage](docs/user-data.md)
- [Development Guide](docs/development.md)
- [Providers & AI Setup](docs/providers.md)
- [Core Architecture](docs/architecture.md)
- [Plugins System](docs/plugins/README.md)

## AI Disclosure

This project was built with the assistance of AI. Please note:

1. AI was primarily used for frontend development and UI structuring.
2. All code written by AI has been strictly reviewed at least twice by a human.
3. **For Contributors:** You are totally welcome to use AI tools for your PRs, but you are expected to know exactly what the fuck the AI did. Do not submit blind generations. Trash code will not be merged.

## Contact

- **Support Server:** [ScyllaCord](https://discord.gg/PTWXzugDXG)
- **Non-support Inquiries:** ScyllaTatsu@waifu.club
