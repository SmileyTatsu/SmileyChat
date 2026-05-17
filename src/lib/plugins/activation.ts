import {
    loadPluginStorageSnapshot,
    savePluginEnabled,
    savePluginStorageSnapshot,
} from "../api/client";
import {
    buildAppliedEnabledMap,
    type PluginConfigSnapshot,
    type PluginProfile,
} from "./profiles";
import { deactivatePlugin, setPluginEnabledState } from "./registry";
import { loadCoreRuntimePlugin, loadRuntimePlugin } from "./runtime";
import type { PluginManifest } from "./types";

export type ProfileActivationResult = {
    appliedEnabled: Record<string, boolean>;
    enabledChanges: Array<{ plugin: PluginManifest; enabled: boolean }>;
    configChanges: string[];
};

export async function applyProfileToPlugins(
    profile: PluginProfile,
    plugins: PluginManifest[],
): Promise<ProfileActivationResult> {
    const appliedEnabled = buildAppliedEnabledMap(profile, plugins);
    const configsToApply: Record<string, PluginConfigSnapshot> = profile.pluginConfig
        ? profile.pluginConfig
        : Object.fromEntries(plugins.map((plugin) => [plugin.id, {}]));
    const enabledChanges: Array<{ plugin: PluginManifest; enabled: boolean }> = [];
    const configChanges: string[] = [];

    for (const [pluginId, snapshot] of Object.entries(configsToApply)) {
        try {
            await savePluginStorageSnapshot(pluginId, snapshot);
            configChanges.push(pluginId);
        } catch (error) {
            console.warn(`Could not restore plugin storage for ${pluginId}:`, error);
        }
    }

    for (const plugin of plugins) {
        const currentEnabled = plugin.enabled !== false;
        const targetEnabled = appliedEnabled[plugin.id] ?? true;
        const configRestored = configChanges.includes(plugin.id);

        if (currentEnabled !== targetEnabled) {
            await applyEnabledChange(plugin, targetEnabled);
            enabledChanges.push({ plugin, enabled: targetEnabled });
            continue;
        }

        if (configRestored && targetEnabled) {
            await reactivatePlugin(plugin);
        }
    }

    return { appliedEnabled, enabledChanges, configChanges };
}

export async function snapshotAllPluginConfigs(
    plugins: PluginManifest[],
): Promise<Record<string, PluginConfigSnapshot>> {
    const result: Record<string, PluginConfigSnapshot> = {};

    for (const plugin of plugins) {
        try {
            const response = await loadPluginStorageSnapshot(plugin.id);
            result[plugin.id] = response.storage;
        } catch (error) {
            console.warn(`Could not snapshot plugin storage for ${plugin.id}:`, error);
        }
    }

    return result;
}

async function applyEnabledChange(plugin: PluginManifest, enabled: boolean) {
    const response = await savePluginEnabled(plugin.id, enabled);
    setPluginEnabledState(plugin.id, enabled);

    if (plugin.source === "core") {
        if (enabled) {
            await loadCoreRuntimePlugin(plugin.id);
        } else {
            deactivatePlugin(plugin.id);
        }
        return;
    }

    if (enabled) {
        const nextPlugin =
            response.plugins?.find((item) => item.id === plugin.id) ?? response.plugin;

        if (nextPlugin) {
            await loadRuntimePlugin(nextPlugin);
        }
    } else {
        deactivatePlugin(plugin.id);
    }
}

async function reactivatePlugin(plugin: PluginManifest) {
    deactivatePlugin(plugin.id);
    if (plugin.source === "core") {
        await loadCoreRuntimePlugin(plugin.id);
    } else {
        await loadRuntimePlugin(plugin);
    }
}
