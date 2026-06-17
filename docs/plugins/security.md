# Plugin Security And Limitations

SmileyChat plugins are trusted local code. A plugin's JavaScript runs in the app page with normal browser privileges for that page.

Only install plugins from sources you trust.

## What Plugins Can Do

Plugins can:

- Read current app snapshots exposed by the plugin API.
- Register UI hooks.
- Modify chat input, compiled prompt messages, and AI output through middleware.
- Request generations from the active model with custom temporary histories.
- Register connection providers.
- Store plugin-owned JSON data.
- Make browser network requests, subject to the browser and endpoint CORS behavior.
- Make server-bridged outbound requests through `api.network.fetch` when the plugin has `network:fetch` and `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true` is set.
- Be installed from a verified registry artifact or, when explicitly enabled, an unverified manual artifact.

## What Plugins Should Not Do

Plugins should not:

- Patch SmileyChat internals directly.
- Depend on private DOM structure or CSS class names unless intentionally documented.
- Store API keys in plugin storage unless the plugin clearly explains the risk.
- Ask for `model:generate` unless the plugin clearly needs to send its own temporary prompts to the active model.
- Modify global prototypes.
- Use broad CSS selectors that restyle unrelated app surfaces.

## Enable And Disable Behavior

Disabling an already-loaded plugin takes effect immediately for supported registry hooks.

Enabling a listed local plugin from Options > Plugins loads it into the current browser session. Newly added plugin folders may need **Refresh**, a disable/enable cycle, or a restart before their JavaScript is loaded.

## Current Limitations

- Permission labels are enforced for protected plugin APIs, but they are not a security sandbox. Plugins are still trusted browser-side code.
- Plugins are browser-side ESM modules. They do not run as Bun server plugins.
- Local plugins can be installed by placing folders under `userData/plugins`.
- Verified registry plugins can be installed from Options > Plugins > Extension Store. SmileyChat validates registry metadata, downloads one prebuilt HTTPS ZIP artifact, validates extracted paths, checks `plugin.json`, `main`, and `styles`, and records install metadata. Verified plugins are still trusted code.
- Manual artifact installs are hidden unless `SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true`. They use the same ZIP validation pipeline but are unverified trusted code.
- SmileyChat does not require SHA-256 hashes for plugin artifacts in release v1. Registry curation is the trust model.
- Plugin cleanup/unload is not a full isolation boundary. Supported hooks are filtered when disabled, but arbitrary side effects from plugin code cannot always be undone.
- Provider plugins run from the frontend and are subject to browser CORS rules unless they explicitly use the guarded plugin fetch bridge for non-provider helper requests.

## Install Trust Model

The Extension Store is a curated list of artifacts that SmileyChat is allowed to
install. It reduces accidental installation from unknown sources, but it does not
sandbox plugin code.

Manual artifact installs bypass registry curation. Treat them like running a local
script from the internet: inspect the source or artifact, verify the author, and keep
the plugin disabled unless you trust it.

## Recommended Plugin Style

- Keep plugin IDs stable.
- Namespace CSS and event names with your plugin ID.
- Use `api.storage` for plugin settings.
- Use the narrowest hook that solves the problem.
- Show user-facing configuration in Options > Plugins.
