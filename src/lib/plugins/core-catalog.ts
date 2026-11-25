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
];

export const CORE_PLUGIN_IDS: ReadonlySet<string> = new Set(
    CORE_PLUGIN_CATALOG.map((entry) => entry.id),
);

export function getCorePluginCatalogEntry(pluginId: string) {
    return CORE_PLUGIN_CATALOG.find((entry) => entry.id === pluginId);
}

/**
 * Permissions a plugin may be granted at runtime.
 *
 * This is the single list for both sides: the server refuses anything outside
 * it (`server/plugin-grants.ts`) and the client offers exactly these in Options
 * > Plugins (`src/lib/plugins/grants.ts`). Everything else a plugin needs is
 * covered by install consent plus declaring it in the manifest, so granting it
 * here would only add a second, weaker gate.
 *
 * Keep this module free of browser-only imports: the Bun server imports it too.
 */
export const GRANTABLE_PLUGIN_PERMISSIONS = [
    "connections:secrets",
    "server:process",
] as const;

export type GrantablePluginPermission = (typeof GRANTABLE_PLUGIN_PERMISSIONS)[number];

export function isGrantablePluginPermission(
    permission: string,
): permission is GrantablePluginPermission {
    return (GRANTABLE_PLUGIN_PERMISSIONS as readonly string[]).includes(permission);
}
