import type { PluginManifest } from "#frontend/lib/plugins/types";

export const chatSummarizerManifest: PluginManifest = {
    id: "smiley-chat-summarizer",
    name: "Smiley Chat Summarizer",
    version: "1.0.0",
    description:
        "Maintains editable rolling chat summaries and injects them into prompts.",
    main: "core-extensions/chat-summarizer",
    permissions: [
        "state:read",
        "model:generate",
        "ui:settings",
        "ui:header",
        "ui:modals",
        "ui:styles",
        "chat:prompt-inject",
        "presets:macros",
        "storage",
    ],
    enabled: false,
    source: "core",
    category: "memory-lore",
};
