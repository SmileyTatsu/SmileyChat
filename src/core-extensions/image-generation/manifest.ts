import type { PluginManifest } from "#frontend/lib/plugins/types";

export const imageGenerationManifest: PluginManifest = {
    id: "smiley-image-generation",
    name: "Image Generation",
    version: "1.0.0",
    description:
        "Generates NovelAI images from chat context with editable prompt-writing rules and exact master-prompt preservation.",
    main: "core-extensions/image-generation",
    permissions: [
        "state:read",
        "model:generate",
        "ui:settings",
        "ui:message-actions",
        "ui:modals",
        "ui:styles",
        "actions",
        "storage",
        "tools:register",
        "commands:register",
        "connections:secrets",
    ],
    enabled: false,
    defaultEnabled: false,
    source: "core",
    category: "input-output",
};
