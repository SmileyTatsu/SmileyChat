/**
 * SmileyChat plugin SDK: the host app's `preact/hooks`.
 *
 * Same reasoning as `preact.js`: the app's import map sends `preact/hooks` here
 * so a plugin shares the renderer's hook machinery. A bundled second copy of
 * Preact would leave `useState`/`useEffect` inert inside host-rendered panels.
 */
const sdk = globalThis.__SMILEYCHAT_PREACT__;

if (!sdk) {
    throw new Error(
        "SmileyChat plugin SDK: Preact is not available yet. Load plugins through SmileyChat instead of importing this file directly.",
    );
}

export const useState = sdk.hooks.useState;
export const useReducer = sdk.hooks.useReducer;
export const useEffect = sdk.hooks.useEffect;
export const useLayoutEffect = sdk.hooks.useLayoutEffect;
export const useRef = sdk.hooks.useRef;
export const useImperativeHandle = sdk.hooks.useImperativeHandle;
export const useMemo = sdk.hooks.useMemo;
export const useCallback = sdk.hooks.useCallback;
export const useContext = sdk.hooks.useContext;
export const useDebugValue = sdk.hooks.useDebugValue;
export const useErrorBoundary = sdk.hooks.useErrorBoundary;
export const useId = sdk.hooks.useId;
