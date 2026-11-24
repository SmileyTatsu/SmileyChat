import type { PluginCategory } from "./types";

/**
 * Extensions that used to ship inside the app and are now installed from the
 * Store.
 *
 * The list exists so an update does not silently take a feature away: the
 * plugin settings page shows these as installable while they are missing, and an
 * install copies the data the bundled extension had already written so summaries,
 * pipelines and image settings survive the move.
 */
export type MovedCorePlugin = {
    id: string;
    name: string;
    description: string;
    category: PluginCategory;
};

/**
 * Folders that may hold the bundled extension's data.
 *
 * Core data folders were named after the plugin id only later; older installs
 * use the id without the `smiley-` prefix (for example `chat-summarizer`). Rather
 * than pin a mapping that would silently miss old data, adoption looks at both
 * spellings and merges whatever it finds.
 */
export function legacyDataFolderCandidates(pluginId: string): string[] {
    const short = pluginId.replace(/^smiley-/, "");

    return short === pluginId ? [pluginId] : [pluginId, short];
}

export const MOVED_CORE_PLUGINS: readonly MovedCorePlugin[] = [
    {
        id: "smiley-chat-summarizer",
        name: "Smiley Chat Summarizer",
        description:
            "Maintains editable rolling chat summaries and injects them into prompts.",
        category: "memory-lore",
    },
    {
        id: "smiley-post-processing",
        name: "Smiley Post Processing",
        description:
            "Runs a pipeline of AI passes that rewrite each reply before it is saved.",
        category: "input-output",
    },
    {
        id: "smiley-image-generation",
        name: "Smiley Image Generation",
        description:
            "Generates NovelAI images from chat context and attaches them to messages.",
        category: "input-output",
    },
];

export const MOVED_CORE_PLUGIN_IDS: ReadonlySet<string> = new Set(
    MOVED_CORE_PLUGINS.map((plugin) => plugin.id),
);

export function getMovedCorePlugin(pluginId: string) {
    return MOVED_CORE_PLUGINS.find((plugin) => plugin.id === pluginId);
}
