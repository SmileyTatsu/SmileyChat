/**
 * SmileyChat plugin SDK: the host app's `preact/jsx-runtime`.
 *
 * A plugin compiled with the automatic JSX transform (`jsx: "react-jsx"`,
 * `jsxImportSource: "preact"`) emits `import ... from "preact/jsx-runtime"`.
 * The app's import map resolves it here so the created elements belong to the
 * same Preact instance that renders them.
 */
const sdk = globalThis.__SMILEYCHAT_PREACT__;

if (!sdk) {
    throw new Error(
        "SmileyChat plugin SDK: Preact is not available yet. Load plugins through SmileyChat instead of importing this file directly.",
    );
}

export const jsx = sdk.jsxRuntime.jsx;
export const jsxs = sdk.jsxRuntime.jsxs;
export const jsxDEV = sdk.jsxRuntime.jsxDEV;
export const jsxAttr = sdk.jsxRuntime.jsxAttr;
export const jsxEscape = sdk.jsxRuntime.jsxEscape;
export const jsxTemplate = sdk.jsxRuntime.jsxTemplate;
export const Fragment = sdk.jsxRuntime.Fragment;
