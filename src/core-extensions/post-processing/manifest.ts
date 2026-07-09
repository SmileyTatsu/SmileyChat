import type { PluginManifest } from "#frontend/lib/plugins/types";

export const postProcessingManifest: PluginManifest = {
    id: "smiley-post-processing",
    name: "Smiley Post Processing",
    version: "1.0.0",
    description: "Runs configurable LLM rewrite passes before saving model replies.",
    main: "core-extensions/post-processing",
    permissions: [
        "state:read",
        "actions",
        "model:generate",
        "ui:settings",
        "ui:modals",
        "ui:styles",
        "ui:message-actions",
        "chat:output",
        "presets:macros",
        "storage",
    ],
    enabled: false,
    source: "core",
    category: "input-output",
};
