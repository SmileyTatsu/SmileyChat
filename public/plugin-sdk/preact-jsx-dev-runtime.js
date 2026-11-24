/**
 * SmileyChat plugin SDK: the host app's `preact/jsx-dev-runtime`.
 *
 * Development builds (JSX with `jsx: "react-jsx"` and `jsxImportSource:
 * "preact"`, no minification) import `jsxDEV` plus source metadata. The extra
 * arguments are only used for dev warnings, so they are forwarded to the
 * runtime's own `jsxDEV`.
 */
import { jsxDEV as runtimeJsxDEV, Fragment } from "./preact-jsx-runtime.js";

export const jsxDEV = runtimeJsxDEV;
export { Fragment };
