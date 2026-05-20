import type { PluginManifest } from "#frontend/lib/plugins/types";

export const lorebooksManifest: PluginManifest = {
    id: "lorebooks",
    name: "LoreBook Manager",
    version: "1.0.0",
    description: "Adds a focused sidebar and full editor for native LoreBooks.",
    main: "core-extensions/lorebooks",
    permissions: ["ui:sidebar", "ui:modals", "ui:styles", "events", "state:read"],
    enabled: true,
    source: "core",
    category: "memory-lore",
};
