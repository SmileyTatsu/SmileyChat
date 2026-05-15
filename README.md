# SmileyChat

> ⚠️ **Project Status: Early Pre-Alpha**
> SmileyChat is currently in a very early stage of development. Please keep in mind that performance is not yet fully optimized, features are still being added, and you may encounter bugs. The core architecture is actively evolving!

SmileyChat is a local-first frontend application for chatting, roleplay, and storytelling with AI chatbots. Designed to be clean, accessible, and friendly to both casual users and writers.

## Features

- **Dual Visual Modes**: Seamlessly switch between a casual "Chatting" mode (like Discord) and a "Roleplaying / Storytelling" mode designed for reading and writing long scenes.
- **Local Persistence**: All your characters, chats, and personas are saved entirely locally in standard JSON files. No cloud lock-in.
- **Providers**: Connect your favorite local models (LMStudio, Ollama, text-generation-webui) or cloud providers via dedicated adapters (OpenRouter, Google AI / Gemini, OpenAI-Compatible).
- **Character Card Support**: Import Tavern-style V1/V2/V3 JSON and PNG character cards easily via drag & drop or file selection.
- **Extensible Plugin System**: Extend the core functionality using local ESM plugins.

## Installation & Usage

SmileyChat runs locally. After it starts, open the displayed URL in your browser, usually `http://127.0.0.1:4173`.

### Windows

Install [Git](https://git-scm.com/) and [Bun](https://bun.sh/), clone the repository, then run:

```cmd
SmileyChat.Windows.cmd
```

To update before starting:

```cmd
scripts\windows\update-start.cmd
```

### Ubuntu / Debian

Install Git, curl, and unzip if they are not already available:

```bash
sudo apt update
sudo apt install -y git curl unzip
```

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Clone and start SmileyChat:

```bash
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
bun install
bun run build
bun run start
```

### Linux

For other Linux distributions, install Git, curl, and unzip with your system package manager, install [Bun](https://bun.sh/), then run:

```bash
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
bun install
bun run build
bun run start
```

### Android / Termux

Android support uses Termux and a Bun compatibility shim. See [`docs/android-termux.md`](docs/android-termux.md) for the full walkthrough.

After setup, start or update SmileyChat with:

```sh
sh ./SmileyChat.Termux.sh
```

### Manual Start

From an existing checkout with Bun installed:

```bash
bun install
bun run build
bun run start
```

## Server Configuration

SmileyChat binds to **`0.0.0.0` by default** so LAN devices, Tailscale
peers, and Docker containers can reach it out of the box. The
safe-by-default lockdown keeps that safe: any non-loopback request gets
a friendly "set up access" page until you configure Basic Auth or an IP
allowlist below. Edit `.env` (auto-created from `.env.example` on first
boot). Most settings hot-reload within ~2 seconds, no restart needed.

The headline knobs:

```bash
# Interface the server binds to. 0.0.0.0 = all interfaces (default).
# Set 127.0.0.1 to refuse every connection except loopback.
SMILEYCHAT_HOST=0.0.0.0

# Require a username/password from every non-loopback caller.
SMILEYCHAT_BASIC_AUTH_USER=
SMILEYCHAT_BASIC_AUTH_PASS=

# Or, restrict by IP/CIDR instead of (or alongside) Basic Auth.
SMILEYCHAT_IP_ALLOWLIST=192.168.1.0/24,10.0.0.5

# When neither of the above is set, SmileyChat refuses non-loopback
# requests with a friendly "set up access" page. Opt back in with these
# only when you understand what they mean:
SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=false
SMILEYCHAT_ALLOW_UNAUTHENTICATED_REMOTE=false
```

When running behind a reverse proxy or under a DNS name, list the public
browser origins that may make state-changing requests:

```bash
SMILEYCHAT_TRUSTED_ORIGINS=https://chat.example.com,http://192.168.1.20:4173
```

Tailscale (`100.64.0.0/10`) and Docker bridge (`172.16.0.0/12`) traffic
is auto-trusted by default. Those clients skip both the IP allowlist
and Basic Auth, the same way loopback does. Toggle with
`SMILEYCHAT_BYPASS_AUTH_TAILSCALE` / `_DOCKER`.

See [docs/security.md](docs/security.md) for the full security model:
every layer, every env var, what it protects against, and recommended
recipes for local / LAN / Tailscale / public-internet deployments.

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

- **Support Server:** [SmileyCord](https://discord.gg/PTWXzugDXG)
- **Non-support Inquiries:** SmileyTatsu@waifu.club
