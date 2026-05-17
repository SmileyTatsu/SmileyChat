import type { PluginManifest } from "#frontend/lib/plugins/types";

export const claudeMaxManifest: PluginManifest = {
    id: "claude-max",
    name: "Claude Max",
    version: "1.0.0",
    description:
        "Talk to Anthropic models using your Claude Pro or Max subscription via the local claude CLI. Requires the official Claude Code CLI to be installed and logged in on this machine.",
    main: "core-extensions/claude-max",
    permissions: ["connections:providers", "ui:settings", "ui:styles"],
    enabled: true,
    source: "core",
};
