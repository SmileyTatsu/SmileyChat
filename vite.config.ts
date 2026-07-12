import tailwindcss from "@tailwindcss/vite";
import preact from "@preact/preset-vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(function ({ mode }) {
    const env = loadEnv(mode, process.cwd(), "");

    const BACKEND_PORT = env.SMILEYCHAT_PORT ?? env.SMILEYCHAT_API_PORT ?? "4173";
    const FRONTEND_PORT = env.SMILEYCHAT_FRONTEND_PORT ?? "5173";

    return {
        resolve: { tsconfigPaths: true },
        plugins: [tailwindcss(), preact()],
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
            },
        },
        build: {
            chunkSizeWarningLimit: 1000,
        },
    };
});
