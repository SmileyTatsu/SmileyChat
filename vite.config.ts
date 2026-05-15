import preact from "@preact/preset-vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(function ({ mode }) {
    const env = loadEnv(mode, process.cwd(), "");

    const BACKEND_PORT = env.SCYLLACHAT_API_PORT ?? "4173";
    const FRONTEND_PORT = env.SCYLLACHAT_FRONTEND_PORT ?? "5173";

    return {
        resolve: { tsconfigPaths: true },
        plugins: [preact()],
        server: {
            port: Number(FRONTEND_PORT),
            proxy: { "/api": `http://127.0.0.1:${BACKEND_PORT}` },
        },
    };
});
