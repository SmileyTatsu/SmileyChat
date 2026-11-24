/**
 * SmileyChat plugin SDK: the host app's Preact instance.
 *
 * Plugins are plain browser ESM loaded from `/plugins/<id>/...`. A plugin built
 * with `--external preact` keeps `import { h } from "preact"` in its artifact;
 * the app's import map (see `vite.config.ts`) resolves that to this file.
 *
 * This file re-exports the app's own Preact rather than shipping a copy. Two
 * Preact instances would each own their `options` object, and `preact/hooks`
 * installs its render hooks on the instance it was imported from: a plugin's
 * `useState` would attach state to a component the app's renderer never
 * notifies, so hooks in host-rendered panels would silently never run.
 *
 * The instance is published through `globalThis.__SMILEYCHAT_PREACT__` because
 * a file in `public/` cannot import from the app bundle.
 */
const sdk = globalThis.__SMILEYCHAT_PREACT__;

if (!sdk) {
    throw new Error(
        "SmileyChat plugin SDK: Preact is not available yet. Load plugins through SmileyChat instead of importing this file directly.",
    );
}

export const h = sdk.preact.h;
export const createElement = sdk.preact.createElement;
export const cloneElement = sdk.preact.cloneElement;
export const createRef = sdk.preact.createRef;
export const createContext = sdk.preact.createContext;
export const Component = sdk.preact.Component;
export const Fragment = sdk.preact.Fragment;
export const options = sdk.preact.options;
export const render = sdk.preact.render;
export const hydrate = sdk.preact.hydrate;
export const isValidElement = sdk.preact.isValidElement;
export const toChildArray = sdk.preact.toChildArray;
