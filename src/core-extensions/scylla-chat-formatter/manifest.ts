import type { PluginManifest } from "#frontend/lib/plugins/types";

export const scyllaChatFormatterManifest: PluginManifest = {
    id: "scylla-chat-formatter",
    name: "Chat Formatter",
    version: "1.0.0",
    description:
        "Renders chat messages with safe markdown and XML-style formatting tags.",
    main: "core-extensions/scylla-chat-formatter",
    permissions: ["ui:messages", "ui:settings", "ui:styles"],
    enabled: true,
    source: "core",
};
