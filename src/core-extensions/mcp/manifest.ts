import type { PluginManifest } from "#frontend/lib/plugins/types";

export const mcpManifest: PluginManifest = {
    id: "smiley-mcp",
    name: "MCP Servers",
    version: "1.0.0",
    description:
        "Connect local and remote Model Context Protocol tools to selected chats.",
    main: "core-extensions/mcp",
    permissions: [
        "state:read",
        "ui:settings",
        "ui:sidebar",
        "ui:styles",
        "tools:register",
    ],
    enabled: false,
    source: "core",
    category: "tools",
};
