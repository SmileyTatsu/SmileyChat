# SmileyChat

> **Project Status: Early Pre-Alpha**
> SmileyChat is currently in a very early stage of development. Please keep in mind that performance is not yet fully optimized, features are still being added, and you may encounter bugs. The core architecture is actively evolving.

SmileyChat is a local-first frontend application for chatting, roleplay, and storytelling with AI chatbots. Designed to be clean, accessible, and friendly to both casual users and writers.

## Related Repositories

- [smileychat-plugins](https://github.com/SmileyTatsu/smileychat-plugins): verified plugin registry, registry schema, and plugin contribution docs.
- [smileychat-plugin-template](https://github.com/SmileyTatsu/smileychat-plugin-template): starter template for building distributable SmileyChat plugins.

## Features

- **Dual Visual Modes**: Seamlessly switch between a casual "Chatting" mode, like Discord, and a "Roleplaying / Storytelling" mode designed for reading and writing long scenes.
- **Local Persistence**: All your characters, chats, and personas are saved entirely locally in standard JSON files. No cloud lock-in.
- **Providers**: Connect your favorite local models, such as LMStudio, Ollama, and text-generation-webui, or cloud providers through dedicated adapters for OpenAI-compatible APIs, OpenRouter, Google AI / Gemini, Anthropic / Claude, and NovelAI.
- **Character Card Support**: Import Tavern-style V1/V2/V3 JSON and PNG character cards easily through drag and drop or file selection.
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

SmileyChat binds to **`0.0.0.0` by default** so LAN devices, Tailscale peers, and Docker containers can reach it out of the box. The safe-by-default lockdown keeps that safe: any non-loopback request gets a friendly "set up access" page until you configure Basic Auth or an IP allowlist below. Edit `.env`, which is auto-created from `.env.example` on first boot. Most settings hot-reload within about 2 seconds, no restart needed.

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

When running behind a reverse proxy or under a DNS name, list the public browser origins that may make state-changing requests:

```bash
SMILEYCHAT_TRUSTED_ORIGINS=https://chat.example.com,http://192.168.1.20:4173
```

Tailscale (`100.64.0.0/10`) and Docker bridge (`172.16.0.0/12`) traffic is auto-trusted by default. Those clients skip both the IP allowlist and Basic Auth, the same way loopback does. Toggle with `SMILEYCHAT_BYPASS_AUTH_TAILSCALE` / `_DOCKER`.

See [docs/reference/security.md](docs/reference/security.md) for the full security model: every layer, every env var, what it protects against, and recommended recipes for local / LAN / Tailscale / public-internet deployments.

## Development

To run the app in development mode with Hot Module Replacement (HMR):

```bash
bun run dev
# In a separate terminal, start the local API server:
bun run dev:api
```

Useful checks:

```bash
bun run typecheck
bun test
bun run build
```

## Documentation

Check the [docs/](docs/) folder for guides, reference material, plugin docs, and technical notes.

### How-To Guides

- [Running SmileyChat on Android via Termux](docs/android-termux.md)
- [How to Connect AI Models](docs/guides/connecting-models.md)
- [How to Import Characters](docs/guides/importing-characters.md)
- [Understanding Presets](docs/guides/understanding-presets.md)
- [How to Backup and Restore Data](docs/guides/backup-and-restore.md)
- [How to Access SmileyChat Remotely](docs/guides/remote-access.md)
- [Troubleshooting](docs/guides/troubleshooting.md)
- [Using LoreBooks](docs/guides/lorebooks.md)

### Technical Details

- [Providers & AI Setup](docs/reference/providers.md)
- [Preset Macros](docs/reference/macros.md)
- [User Data & Storage](docs/reference/user-data.md)
- [Security Model](docs/reference/security.md)
- [Development Guide](docs/development/development.md)
- [Core Architecture](docs/development/architecture.md)
- [Plugins System](docs/plugins/README.md)

## License

SmileyChat is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Third-party plugins that interact with SmileyChat only through the documented plugin runtime API may use their own licenses. Modified versions of SmileyChat itself remain covered by AGPL-3.0.

## AI Disclosure

This project was built with the assistance of AI. Please note:

1. AI was primarily used for frontend development and UI structuring.
2. All code written by AI has been strictly reviewed at least twice by a human.
3. **For Contributors:** You are welcome to use AI tools for your PRs, but you are expected to know exactly what the AI changed. Do not submit blind generations. Low-quality code will not be merged.

## Contact

- **Support Server:** [SmileyCord](https://discord.gg/PTWXzugDXG)
- **Non-support Inquiries:** SmileyTatsu@waifu.club
