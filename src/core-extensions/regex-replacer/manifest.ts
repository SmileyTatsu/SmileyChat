import type { PluginManifest } from "#frontend/lib/plugins/types";

export const regexReplacerManifest: PluginManifest = {
    id: "smiley-regex-replacer",
    name: "Regex Replacer",
    version: "1.0.0",
    description: "Applies ordered regular-expression replacements to character replies.",
    main: "core-extensions/regex-replacer",
    permissions: [
        "ui:settings",
        "ui:styles",
        "chat:display",
        "chat:input",
        "chat:output",
        "chat:message-update",
        "chat:prompt",
        "state:read",
        "presets:macros",
        "storage",
    ],
    enabled: true,
    source: "core",
    category: "input-output",
};
