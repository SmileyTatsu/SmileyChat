import type { PluginManifest } from "./types";
import { isNewerVersion } from "./version";

export type RegistryVersionSource = {
    id: string;
    version: string;
};

/**
 * Returns the registry version when it is newer than the installed manifest.
 *
 * Only plugins installed by SmileyChat have a trustworthy version source.
 * Manual artifacts have no registry version to compare against, and local
 * development folders must never be presented with an "Update" action because
 * installing over them would replace hand-edited code.
 */
export function findAvailablePluginUpdate(
    plugin: PluginManifest,
    registryPlugins: ReadonlyArray<RegistryVersionSource>,
): string | undefined {
    if (plugin.source === "core" || plugin.install?.source !== "registry") {
        return undefined;
    }

    const registryPlugin = registryPlugins.find((entry) => entry.id === plugin.id);

    if (!registryPlugin) {
        return undefined;
    }

    return isNewerVersion(registryPlugin.version, plugin.version)
        ? registryPlugin.version
        : undefined;
}

export function collectAvailablePluginUpdates(
    plugins: ReadonlyArray<PluginManifest>,
    registryPlugins: ReadonlyArray<RegistryVersionSource>,
): Map<string, string> {
    const updates = new Map<string, string>();

    for (const plugin of plugins) {
        const availableVersion = findAvailablePluginUpdate(plugin, registryPlugins);

        if (availableVersion) {
            updates.set(plugin.id, availableVersion);
        }
    }

    return updates;
}
