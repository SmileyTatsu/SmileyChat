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
    /**
     * Folder under `userData/settings/core-extensions` that held the bundled
     * extension's data. Installs copy `*.json` from here into the plugin's own
     * `data/` folder.
     */
    legacyDataFolder: string;
};

export const MOVED_CORE_PLUGINS: readonly MovedCorePlugin[] = [
    {
        id: "smiley-chat-summarizer",
        name: "Smiley Chat Summarizer",
        description:
            "Maintains editable rolling chat summaries and injects them into prompts.",
        category: "memory-lore",
        legacyDataFolder: "smiley-chat-summarizer",
    },
    {
        id: "smiley-post-processing",
        name: "Smiley Post Processing",
        description:
            "Runs a pipeline of AI passes that rewrite each reply before it is saved.",
        category: "input-output",
        legacyDataFolder: "smiley-post-processing",
    },
    {
        id: "smiley-image-generation",
        name: "Smiley Image Generation",
        description:
            "Generates NovelAI images from chat context and attaches them to messages.",
        category: "input-output",
        legacyDataFolder: "smiley-image-generation",
    },
];

export const MOVED_CORE_PLUGIN_IDS: ReadonlySet<string> = new Set(
    MOVED_CORE_PLUGINS.map((plugin) => plugin.id),
);

export function getMovedCorePlugin(pluginId: string) {
    return MOVED_CORE_PLUGINS.find((plugin) => plugin.id === pluginId);
}
