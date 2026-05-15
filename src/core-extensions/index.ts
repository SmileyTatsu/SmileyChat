import type { PluginManifest } from "../lib/plugins/types";
import { smileyChatFormatterPlugin } from "./smiley-chat-formatter";

export const corePlugins = [smileyChatFormatterPlugin];
export const corePluginIds = new Set(corePlugins.map((plugin) => plugin.manifest.id));

export function getCorePluginManifests() {
    return corePlugins.map((plugin) => plugin.manifest);
}

export function mergeCoreAndUserPluginManifests<
    T extends { id: string; source?: "core" | "user" },
>(userManifests: T[]) {
    const coreOverrides = new Map(
        userManifests
            .filter(
                (manifest) =>
                    manifest.source === "core" && corePluginIds.has(manifest.id),
            )
            .map((manifest) => [manifest.id, manifest as Partial<PluginManifest>]),
    );

    return [
        ...getCorePluginManifests().map((manifest) => ({
            ...manifest,
            enabled:
                typeof coreOverrides.get(manifest.id)?.enabled === "boolean"
                    ? coreOverrides.get(manifest.id)?.enabled
                    : manifest.enabled,
        })),
        ...userManifests.filter((manifest) => !corePluginIds.has(manifest.id)),
    ];
}

export function getCorePlugin(pluginId: string) {
    return corePlugins.find((plugin) => plugin.manifest.id === pluginId);
}
