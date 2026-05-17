import { localApiFetch } from "#frontend/lib/api/client";
import type { ConnectionProfile } from "#frontend/lib/connections/config";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { createClaudeMaxAdapter } from "./adapter";
import { defaultClaudeMaxConfig, normalizeClaudeMaxConfig } from "./config";
import { claudeMaxManifest } from "./manifest";
import { renderClaudeMaxSettings } from "./settings-panel";
import styles from "./styles.css?raw";

export { claudeMaxManifest };

export async function activate(api: SmileyPluginApi) {
    api.ui.addStyles(styles);

    api.connections.registerProvider({
        id: "claude-max",
        label: "Claude Max",
        defaultConfig: { ...defaultClaudeMaxConfig },
        createAdapter(profile: ConnectionProfile) {
            return createClaudeMaxAdapter(normalizeClaudeMaxConfig(profile.config));
        },
        renderSettings(props) {
            return renderClaudeMaxSettings(props);
        },
        async testConnection() {
            const response = await localApiFetch("/api/claude-max/status");

            if (!response.ok) {
                throw new Error(
                    `Claude Max status check failed: ${response.status}.`,
                );
            }

            const body = (await response.json()) as {
                ok?: boolean;
                version?: string;
                error?: string;
            };

            if (body.ok) {
                return body.version
                    ? `Claude CLI is installed and responding (version ${body.version}).`
                    : "Claude CLI is installed and responding.";
            }

            throw new Error(
                body.error ??
                    "Claude CLI is not available. Install it with 'npm i -g @anthropic-ai/claude-code' and run 'claude login'.",
            );
        },
    });
}

export const claudeMaxPlugin = {
    manifest: claudeMaxManifest,
    module: { activate },
};
