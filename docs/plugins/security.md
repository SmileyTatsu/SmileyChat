# Plugin Security And Limitations

SmileyChat plugins are trusted local code. A plugin's JavaScript runs in the app page with normal browser privileges for that page. A plugin that declares `serverMain` also ships code that runs in the SmileyChat server process, with the user's full operating-system privileges.

Only install plugins from sources you trust.

## What Plugins Can Do

Plugins can:

- Read current app snapshots exposed by the plugin API.
- Register UI hooks.
- Modify chat input, compiled prompt messages, AI output, and saved message updates through middleware.
- Request generations from configured models with custom temporary histories.
- Register connection providers.
- Store plugin-owned JSON data.
- Make browser network requests, subject to the browser and endpoint CORS behavior.
- Make server-bridged outbound requests through `api.network.fetch` when the plugin has `network:fetch` and `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true` is set.
- Run a server module in the Bun server, and start other programs, once the user approves `server:process` for it.
- Be installed from a verified registry artifact or, when explicitly enabled, an unverified manual artifact.

## What Plugins Should Not Do

Plugins should not:

- Patch SmileyChat internals directly.
- Depend on private DOM structure or CSS class names unless intentionally documented.
- Store API keys in plugin storage unless the plugin clearly explains the risk.
- Ask for `model:generate` unless the plugin clearly needs to send its own temporary prompts to a configured model.
- Ask for `server:process` unless the plugin really needs to run code or programs outside the browser, and say what it starts when it does.
- Modify global prototypes.
- Use broad CSS selectors that restyle unrelated app surfaces.

## Enable And Disable Behavior

Disabling an already-loaded plugin takes effect immediately for supported registry hooks.

Enabling a listed local plugin from Options > Plugins loads it into the current browser session; no restart is needed. A plugin folder added after the page loaded needs **Refresh** plus a disable/enable cycle, or a page reload, before its JavaScript runs.

A plugin server module follows the plugin itself: it starts when the plugin is enabled, compatible, declares `serverMain` and `server:process`, and the user has approved the permission. Disabling the plugin, revoking the approval, updating it, uninstalling it, or shutting SmileyChat down stops the module and the programs it started.

## Server Modules

A plugin with a `serverMain` entry runs code inside the SmileyChat server process. That code is not sandboxed. It can read `userData` (including saved connection secrets and the grants file), open network connections, and start any program the user can start. The approval is a deliberate stop before that power is handed over, not a boundary around it.

What SmileyChat enforces:

- The module is not loaded unless the manifest declares both `serverMain` and `server:process`, **and** the user approved `server:process` for that plugin in **Options > Plugins > the plugin card > Approvals** (labelled "Run programs on your computer"). Approving asks for confirmation.
- Approval and replacement of an approved plugin require privileged access: loopback, or the `X-SmileyChat-Admin-Secret` header. A remote client that passes normal API auth cannot grant the permission or swap the code of a plugin that holds it.
- Revoking the approval stops the module without uninstalling the plugin.
- The grant is stored per plugin ID in `userData/settings/plugin-grants.json`, so it survives restarts and updates.
- Stopping a module disposes it, then kills every process it spawned; on Windows, their whole process trees (`taskkill /F /T`), and on Linux and macOS only the process it spawned. The shutdown handlers do the same on `SIGINT`, `SIGTERM`, `SIGHUP`, and `SIGBREAK`, with a 4.5 second cap.
- The module's routes live under `/api/plugins/{pluginId}/host/*` and pass through the normal API security pipeline. They are not behind the privileged gate: the module decides what it exposes, so a handler must treat its callers as "someone who can use this app" and must not change state on `GET`.

What it does not give you:

- No sandbox, no privilege drop, no resource limits. A malicious or compromised approved plugin owns the machine.
- The approval is per plugin ID, not per version. An update can change what the approved code does; installing or updating an approved plugin needs privileged access, but the new code is then trusted blindly. There are no hashes or signatures on plugin artifacts in release v1. Uninstalling an installed plugin drops its approvals (every runtime permission, not just `server:process`), so a reinstall of the same ID asks again.
- A remote client that passes normal API auth can still call the plugin's host routes, toggle the plugin's `enabled` flag to start or stop an approved module, and read or write the plugin's `data/` through the storage API.
- The module's source is served like any other plugin file under `/plugins/{pluginFolder}/...`, so it can be read by anyone who can load the app.
- A private copy of the plugin folder is made in the OS temp directory for each start, so the code is also on disk there while it runs.
- Spawned programs inherit the user's environment and privileges, and are not isolated from each other or from the rest of the machine. On Windows stopping a module kills each spawned process with its whole tree, and the app's job object kills them if SmileyChat crashes. On Linux, macOS, and Termux only the process the plugin spawned is killed, so a launcher that does not `exec` the real program leaves its own children running, and a hard crash can leave them behind, the same as MCP stdio servers. Plugin server modules have been developed and verified on Windows only; that non-Windows kill path has not been exercised on a real Linux or macOS host.

The full guarantee list, including how the privileged check resolves for loopback and remote callers, is in [the security model](../reference/security.md#plugin-server-modules).

## Current Limitations

- Permission labels are enforced for protected plugin APIs, but they are not a security sandbox. Plugins are still trusted code.
- Plugins normally run as browser-side ESM modules. A plugin with `serverMain` additionally runs one module in the Bun server, as described above.
- Local plugins can be installed by placing folders under `userData/plugins`.
- Verified registry plugins can be installed from Options > Plugins > Extension Store. SmileyChat validates registry metadata, downloads one prebuilt HTTPS ZIP artifact, validates extracted paths, checks `plugin.json`, `main`, `styles`, and `serverMain`, and records install metadata. Verified plugins are still trusted code.
- Manual artifact installs are hidden unless `SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true`. They use the same ZIP validation pipeline but are unverified trusted code.
- SmileyChat does not require SHA-256 hashes for plugin artifacts in release v1. Registry curation is the trust model.
- Plugin cleanup/unload is not a full isolation boundary. Supported hooks are filtered when disabled, but arbitrary side effects from plugin code cannot always be undone. Stopping a server module disposes it and kills its processes; anything it wrote outside `userData` stays.
- Uninstalling an installed plugin stops its server module, removes its files from `userData/plugins`, and stops it in the current session. Local development folders without `smileychat-install.json` are never deleted by the app. Saved plugin `data/` is kept unless the user enables "Also delete this plugin's saved data".
- Provider plugins run from the frontend and are subject to browser CORS rules unless they explicitly use the guarded plugin fetch bridge for non-provider helper requests.
- A failed server module start is not retried until the plugin is toggled, reinstalled, or its `serverMain` entry file changes.

## Install Trust Model

The Extension Store is a curated list of artifacts that SmileyChat is allowed to
install. It reduces accidental installation from unknown sources, but it does not
sandbox plugin code.

Manual artifact installs bypass registry curation. Treat them like running a local
script from the internet: inspect the source or artifact, verify the author, and keep
the plugin disabled unless you trust it.

Install consent covers what a plugin can ask for. A plugin that runs code on your
computer needs a second, separate approval in Options > Plugins after it is installed,
and that approval is the only thing standing between an installed plugin and programs
running as you.

## Recommended Plugin Style

- Keep plugin IDs stable.
- Namespace CSS and event names with your plugin ID.
- Use `api.storage` for plugin settings.
- Use the narrowest hook that solves the problem.
- Show user-facing configuration in Options > Plugins.
