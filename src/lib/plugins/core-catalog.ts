import type { PluginCategory } from "./types";

/**
 * Pure-data description of the extensions bundled with the app.
 *
 * The server cannot import the extension modules themselves (they pull in UI
 * code), yet it has to know which plugin IDs are reserved, what they are
 * called, and whether they ship enabled. This catalog is that shared list.
 * `core-catalog.test.ts` checks it against every bundled manifest, so adding
 * or renaming a core extension without updating it fails the test suite.
 */
export type CorePluginCatalogEntry = {
    id: string;
    name: string;
    category: PluginCategory;
    /** Whether the extension is enabled before the user or a profile changes it. */
    defaultEnabled: boolean;
    /** Older `userData/plugins` folders whose storage should still be read. */
    legacyFolders?: string[];
};

export const CORE_PLUGIN_CATALOG: readonly CorePluginCatalogEntry[] = [
    {
        id: "smiley-chat-formatter",
        name: "Chat Formatter",
        category: "interface",
        defaultEnabled: true,
        legacyFolders: ["chat-formatter", "smiley-chat-formatter"],
    },
    {
        id: "smiley-lorebooks",
        name: "Smiley Lorebook Manager",
        category: "memory-lore",
        defaultEnabled: true,
    },
    {
        id: "smiley-chat-summarizer",
        name: "Smiley Chat Summarizer",
        category: "memory-lore",
        defaultEnabled: false,
    },
    {
        id: "smiley-post-processing",
        name: "Smiley Post Processing",
        category: "input-output",
        defaultEnabled: false,
    },
    {
        id: "smiley-regex-replacer",
        name: "Regex Replacer",
        category: "input-output",
        defaultEnabled: true,
    },
    {
        id: "smiley-mcp",
        name: "MCP Servers",
        category: "tools",
        defaultEnabled: false,
    },
    {
        id: "smiley-workspace-tools",
        name: "Workspace AI Tools",
        category: "tools",
        defaultEnabled: false,
    },
    {
        id: "smiley-image-generation",
        name: "Image Generation",
        category: "input-output",
        defaultEnabled: false,
    },
];

export const CORE_PLUGIN_IDS: ReadonlySet<string> = new Set(
    CORE_PLUGIN_CATALOG.map((entry) => entry.id),
);

export function getCorePluginCatalogEntry(pluginId: string) {
    return CORE_PLUGIN_CATALOG.find((entry) => entry.id === pluginId);
}
