import tailwindcss from "@tailwindcss/vite";
import preact from "@preact/preset-vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Bare specifiers a plugin artifact may keep after its build.
 *
 * Plugins are browser ESM, so a plugin built with `--external preact` ships
 * `import { h } from "preact"` and needs the browser to resolve that name. The
 * map points every specifier at a static shim in `public/plugin-sdk`, and each
 * shim re-exports the app's own Preact instance (published on
 * `globalThis.__SMILEYCHAT_PREACT__`). Sharing the instance is what lets
 * `preact/hooks` state work inside host-rendered plugin panels.
 */
export const PLUGIN_SDK_IMPORTS = {
    preact: "/plugin-sdk/preact.js",
    "preact/hooks": "/plugin-sdk/preact-hooks.js",
    "preact/jsx-runtime": "/plugin-sdk/preact-jsx-runtime.js",
    "preact/jsx-dev-runtime": "/plugin-sdk/preact-jsx-dev-runtime.js",
} as const;

/**
 * Injects the plugin SDK import map as the first tag in `<head>`.
 *
 * Order matters: Chrome refuses an import map that appears after a module
 * script has started loading, and both the dev client and the built entry are
 * module scripts in `<head>`. `order: "post"` runs after Vite's own HTML
 * transforms and `head-prepend` puts the map ahead of everything they added.
 */
function pluginSdkImportMap(): Plugin {
    const map = JSON.stringify({ imports: PLUGIN_SDK_IMPORTS });

    return {
        name: "smileychat-plugin-sdk-import-map",
        transformIndexHtml: {
            order: "post",
            handler: () => [
                {
                    tag: "script",
                    attrs: { type: "importmap" },
                    children: map,
                    injectTo: "head-prepend" as const,
                },
            ],
        },
    };
}

export default defineConfig(function ({ mode }) {
    const env = loadEnv(mode, process.cwd(), "");

    const BACKEND_PORT = env.SMILEYCHAT_PORT ?? env.SMILEYCHAT_API_PORT ?? "4173";
    const FRONTEND_PORT = env.SMILEYCHAT_FRONTEND_PORT ?? "5173";

    return {
        resolve: { tsconfigPaths: true },
        plugins: [tailwindcss(), preact(), pluginSdkImportMap()],
        server: {
            port: Number(FRONTEND_PORT),
            proxy: {
                "/api": {
                    target: `http://127.0.0.1:${BACKEND_PORT}`,
                    changeOrigin: true,
                    // Let the backend control streamed response lifetime.
                    timeout: 0,
                    proxyTimeout: 0,
                },
                // Local plugins are served by the Bun server out of
                // userData/plugins. Without this proxy Vite's SPA fallback
                // answers the plugin entry with index.html and the dynamic
                // import dies on MIME type, so no local plugin loads in dev.
                "/plugins": {
                    target: `http://127.0.0.1:${BACKEND_PORT}`,
                    changeOrigin: true,
                },
            },
        },
        build: {
            // Tokenizers go brrrrrrrrrrrrrrrr
            chunkSizeWarningLimit: 2500,
        },
    };
});
