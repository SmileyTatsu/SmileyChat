import type { PluginManifest } from "#frontend/lib/plugins/types";

export const workspaceToolsManifest: PluginManifest = {
    id: "smiley-workspace-tools",
    name: "Workspace AI Tools",
    version: "1.0.0",
    description:
        "Exposes workspace management actions (Lorebooks, characters, personas, chats) directly to AI models.",
    main: "core-extensions/workspace-tools",
    permissions: ["tools:register", "actions", "state:read", "network:fetch"],
    enabled: false,
    source: "core",
    category: "tools",
};
