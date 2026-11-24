/**
 * Publishes the app's Preact instance to plugins.
 *
 * `public/plugin-sdk/*.js` are static modules that cannot import from the app
 * bundle, so the app hands them its own Preact through a global before any
 * plugin module is imported. Sharing one instance is what keeps `preact/hooks`
 * state working inside host-rendered plugin panels; see
 * `public/plugin-sdk/preact.js` for the failure mode of two copies.
 */
import * as preact from "preact";
import * as hooks from "preact/hooks";
import * as jsxRuntime from "preact/jsx-runtime";

export type SmileyChatPluginPreactSdk = {
    preact: typeof preact;
    hooks: typeof hooks;
    jsxRuntime: typeof jsxRuntime;
};

declare global {
    // eslint-disable-next-line no-var
    var __SMILEYCHAT_PREACT__: SmileyChatPluginPreactSdk | undefined;
}

export function installPluginPreactSdk() {
    globalThis.__SMILEYCHAT_PREACT__ = { preact, hooks, jsxRuntime };
}

// Module side effect: any code path that can import a plugin imports this
// module first, so the global exists before the first plugin module evaluates.
installPluginPreactSdk();
