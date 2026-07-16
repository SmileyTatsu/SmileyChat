<div align="center">
  
<img src="public/SmileyChat_header.png" alt="SmileyChat Banner" width="100%" />

**A clean, local-first frontend for utility, chatting, roleplay, or storytelling with LLMs.**

[![Project Status](https://img.shields.io/badge/status-Beta-blue.svg)](#project-status)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/discord/1166241535617142867?label=Discord&logo=discord&logoColor=white)](https://discord.gg/PTWXzugDXG)

</div>

---

> **Project Status: Beta**  
> SmileyChat is in Beta. The core features are stable, and we are now focusing on squashing bugs, improving performance, and refining the user experience. You may still encounter occasional bugs.

## What is SmileyChat?

SmileyChat is a local-first frontend application designed for interacting with AI chatbots. Whether you are looking for casual chatting, immersive roleplay, or deep storytelling, SmileyChat provides a clean, accessible, and user-friendly experience for both beginners and experienced writers.

## Features

- **Local Persistence**: Your data belongs to you. All characters, chats, and personas are saved locally in standard JSON files. No cloud lock-in.
- **Provider Support**: Connect your favorite AI backends. We feature dedicated adapters for OpenAI-compatible APIs, OpenRouter, Google AI / Gemini, Anthropic / Claude, NovelAI, and xAI. Includes built-in support for response streaming.
- **Character Cards**: Easily import Tavern-style V1, V2, and V3 JSON or PNG character cards via drag-and-drop. View and edit character details in a dedicated sidebar.
- **Advanced Presets & Prompts**: Full support for custom preset formats, SillyTavern preset imports, and comprehensive macro replacement (`{{char}}`, `{{user}}`, `{{last_message}}`, etc.) to heavily customize AI behavior.
- **Personas**: Create and manage multiple user personas. Switch between them instantly and set custom visual statuses (Online, Away, Do Not Disturb).
- **Attachments & Multimodality**: Support for image and file attachments during chats, integrating directly with multimodal providers.
- **Context Management**: Intelligent context trimming based on your local provider's token limits to ensure prompt stability and prevent token overflow.
- **Extensible Plugin System**: Customize and extend the core functionality using local ESM plugins.

### Built-in Utilities

Included as bundled plugins, SmileyChat provides powerful tools right out of the box:

- **LoreBooks**: Manage World Info with native support for creating, importing, and exporting LoreBooks to inject dynamic contextual information into your active chats.
- **Chat Formatter**: A dedicated formatter for cleaner chat presentation.
- **Regex Replacer**: Automatically format and replace text in messages using custom regular expressions.
- **Chat Summarizer**: Generate concise summaries of long conversations to save context tokens.
- **Post Processing**: Apply custom processing prompts to refine or alter the AI's final output.
- **MCP Servers**: Built-in support for Model Context Protocol integration.

---

## Getting Started

SmileyChat runs locally on your machine. Once started, access it in your browser (typically at `http://127.0.0.1:4173`).

### Windows

1. Install [Git](https://git-scm.com/).
2. Clone the repository and run the startup script (it will offer to automatically install Bun if you don't have it):

```cmd
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
SmileyChat.Windows.cmd
```

_(To update the app before starting, use `SmileyChat.Windows.Update.cmd`)_

### Linux (Ubuntu / Debian / Others)

First, ensure Git, curl, and unzip are installed via your package manager. For Debian/Ubuntu, run:

```bash
sudo apt update
sudo apt install -y git curl unzip
```

Then, clone the repository and run the startup script (it will offer to automatically install Bun if you don't have it):

```bash
git clone https://github.com/SmileyTatsu/SmileyChat.git
cd SmileyChat
./SmileyChat.Linux.sh
```

_(To update the app before starting, use `./SmileyChat.Linux.Update.sh`)_

### Android / Termux

Android is supported using Termux and a Bun compatibility shim.
**[Read the full Android walkthrough](docs/android-termux.md)**.

Once configured, start or update SmileyChat with:

```sh
sh ./SmileyChat.Termux.sh
```

---

## Server Configuration

By default, SmileyChat binds to **`0.0.0.0`**, making it accessible to LAN devices, Tailscale peers, and Docker containers out of the box.

**Safe-by-Default:** Any non-loopback request will show a "set up access" page until you configure authentication. Edit the `.env` file (auto-created on first boot) to manage access. Most changes hot-reload in ~2 seconds.

```bash
# Interface the server binds to. 0.0.0.0 = all interfaces (default).
# Set 127.0.0.1 to refuse every connection except loopback.
SMILEYCHAT_HOST=0.0.0.0

# Require a username/password from every non-loopback caller.
SMILEYCHAT_BASIC_AUTH_USER=
SMILEYCHAT_BASIC_AUTH_PASS=

# Restrict access by IP/CIDR instead of (or alongside) Basic Auth.
SMILEYCHAT_IP_ALLOWLIST=192.168.1.0/24,10.0.0.5
```

> For reverse proxy setups, Docker, Tailscale, or public access, please review our comprehensive **[Security Model Documentation](docs/reference/security.md)**.

---

## Documentation

Dive deeper into SmileyChat's features and technical architecture in the `docs/` folder.

### How-To Guides

- [Connecting AI Models](docs/guides/connecting-models.md)
- [Importing Characters](docs/guides/importing-characters.md)
- [Understanding Presets](docs/guides/understanding-presets.md)
- [Backup and Restore Data](docs/guides/backup-and-restore.md)
- [Accessing SmileyChat Remotely](docs/guides/remote-access.md)
- [Using LoreBooks](docs/guides/lorebooks.md)
- [Troubleshooting](docs/guides/troubleshooting.md)

### Technical Details

- [Providers & AI Setup](docs/reference/providers.md)
- [Preset Macros](docs/reference/macros.md)
- [User Data & Storage](docs/reference/user-data.md)
- [Core Architecture](docs/development/architecture.md)
- [Security Model](docs/reference/security.md)
- [Plugins System](docs/plugins/README.md)

---

## Development & Ecosystem

### Ecosystem Repositories

- [**smileychat-plugins**](https://github.com/SmileyTatsu/smileychat-plugins): Verified plugin registry, schemas, and contribution docs.
- [**smileychat-plugin-template**](https://github.com/SmileyTatsu/smileychat-plugin-template): Starter template for building distributable plugins.

### Running in Dev Mode

To run the app with Hot Module Replacement (HMR) for active development:

```bash
# Terminal 1: Frontend
bun run dev

# Terminal 2: Local API server
bun run dev:api
```

Helpful checks before submitting PRs:

```bash
bun run typecheck
bun test
bun run build
```

See the [Development Guide](docs/development/development.md) for more details.

---

## Credits & Acknowledgements

- **Post-Processing Default Prompts:** The default pipeline prompts for the post-processing extension were adapted from [closuretxt's recast-post-processing](https://github.com/closuretxt/recast-post-processing).

## License & Contact

- **License:** [GNU AGPL v3.0](LICENSE). Modified versions of SmileyChat must remain covered by AGPL-3.0. Third-party plugins using the documented API may use their own licenses.
- **Community & Support:** Join the [SmileyCord Discord Server](https://discord.gg/PTWXzugDXG)
- **Inquiries:** SmileyTatsu@waifu.club
