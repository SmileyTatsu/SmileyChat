import { useEffect, useMemo, useState } from "preact/hooks";

import { mergeCoreAndUserPluginManifests } from "#frontend/core-extensions";
import {
    deletePluginProfile,
    installVerifiedPlugin,
    loadPluginManifests,
    loadPluginProfiles,
    loadPluginRegistry,
    savePluginEnabled,
    savePluginProfilesState,
    type PluginRegistryEntry,
    type PluginProfilesPayload,
} from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import {
    applyProfileToPlugins,
    snapshotAllPluginConfigs,
} from "#frontend/lib/plugins/activation";
import {
    BUILT_IN_PROFILES,
    DEFAULT_PROFILE_ID,
    isStateCustom,
    type PluginProfile,
    type PluginProfilesState,
} from "#frontend/lib/plugins/profiles";
import {
    deactivatePlugin,
    getLoadedPlugins,
    getPluginSettingsPanels,
    setPluginEnabledState,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import { loadCoreRuntimePlugin, loadRuntimePlugin } from "#frontend/lib/plugins/runtime";
import {
    PLUGIN_CATEGORIES,
    PLUGIN_CATEGORY_LABELS,
    type PluginCategory,
    type PluginManifest,
} from "#frontend/lib/plugins/types";

import {
    type InstalledFilter,
    nextProfileName,
    pluginIdFromScopedId,
    type PluginsView,
    type RequestState,
    uniqueProfileId,
} from "./plugin-settings-helpers";

export function usePluginSettings() {
    const [plugins, setPlugins] = useState<PluginManifest[]>([]);
    const [profilesPayload, setProfilesPayload] = useState<PluginProfilesPayload | null>(
        null,
    );
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [openPluginId, setOpenPluginId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [installedFilter, setInstalledFilter] = useState<InstalledFilter>("all");
    const [categoryFilter, setCategoryFilter] = useState<PluginCategory | "all">("all");
    const [activeView, setActiveView] = useState<PluginsView>("local");
    const [registryPlugins, setRegistryPlugins] = useState<PluginRegistryEntry[]>([]);
    const [registryLoaded, setRegistryLoaded] = useState(false);
    const [registryFailed, setRegistryFailed] = useState(false);
    const [installingPluginId, setInstallingPluginId] = useState("");
    const [, setRegistryRevision] = useState(0);
    const loadedPlugins = getLoadedPlugins();
    const pluginSettingsPanels = getPluginSettingsPanels();

    useEffect(() => {
        void refreshAll();
    }, []);

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    const currentEnabledMap = useMemo(() => {
        const map: Record<string, boolean> = {};
        for (const plugin of plugins) {
            map[plugin.id] = plugin.enabled !== false;
        }
        return map;
    }, [plugins]);

    const allProfiles = useMemo<PluginProfile[]>(() => {
        const builtins = profilesPayload?.builtinProfiles ?? BUILT_IN_PROFILES;
        const userProfiles = profilesPayload?.userProfiles ?? [];
        return [...builtins, ...userProfiles];
    }, [profilesPayload]);

    const activeProfileId = profilesPayload?.activeProfileId ?? DEFAULT_PROFILE_ID;
    const activeProfile =
        allProfiles.find((profile) => profile.id === activeProfileId) ?? allProfiles[0];
    const isCustom = profilesPayload
        ? isStateCustom(currentEnabledMap, profilesPayload.lastApplied)
        : false;
    const setProfilesStateFromSave = (state: PluginProfilesState) => {
        setProfilesPayload({
            activeProfileId: state.activeProfileId,
            lastApplied: state.lastApplied,
            builtinProfiles: profilesPayload?.builtinProfiles ?? BUILT_IN_PROFILES,
            userProfiles: state.userProfiles,
        });
    };

    const filteredPlugins = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        return plugins.filter((plugin) => {
            const category = plugin.category ?? "other";
            const enabled = plugin.enabled !== false;

            if (categoryFilter !== "all" && category !== categoryFilter) {
                return false;
            }

            if (installedFilter === "installed" && !enabled) {
                return false;
            }

            if (installedFilter === "not-installed" && enabled) {
                return false;
            }

            if (search) {
                const haystack = [
                    plugin.name,
                    plugin.id,
                    plugin.description ?? "",
                    PLUGIN_CATEGORY_LABELS[category],
                ]
                    .join(" ")
                    .toLowerCase();

                if (!haystack.includes(search)) {
                    return false;
                }
            }

            return true;
        });
    }, [plugins, searchTerm, installedFilter, categoryFilter]);

    const groupedPlugins = useMemo(() => {
        const groups = new Map<PluginCategory, PluginManifest[]>();
        for (const plugin of filteredPlugins) {
            const category = plugin.category ?? "other";
            const bucket = groups.get(category) ?? [];
            bucket.push(plugin);
            groups.set(category, bucket);
        }
        return PLUGIN_CATEGORIES.filter((category) => groups.has(category)).map(
            (category) => [category, groups.get(category) ?? []] as const,
        );
    }, [filteredPlugins]);

    const categoryCounts = useMemo(() => {
        const counts = new Map<PluginCategory, number>();
        for (const plugin of plugins) {
            const category = plugin.category ?? "other";
            counts.set(category, (counts.get(category) ?? 0) + 1);
        }
        return counts;
    }, [plugins]);

    const localPluginIds = useMemo(
        () => new Set(plugins.map((plugin) => plugin.id)),
        [plugins],
    );

    const registryStatusById = useMemo(() => {
        const map = new Map<string, PluginRegistryEntry["status"]>();
        if (registryFailed) {
            return map;
        }
        for (const plugin of registryPlugins) {
            map.set(plugin.id, plugin.status);
        }
        return map;
    }, [registryFailed, registryPlugins]);

    const filteredRegistryPlugins = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        return registryPlugins.filter((plugin) => {
            const installed = localPluginIds.has(plugin.id);

            if (categoryFilter !== "all" && plugin.category !== categoryFilter) {
                return false;
            }

            if (installedFilter === "installed" && !installed) {
                return false;
            }

            if (installedFilter === "not-installed" && installed) {
                return false;
            }

            if (search) {
                const haystack = [
                    plugin.name,
                    plugin.id,
                    plugin.description ?? "",
                    plugin.author ?? "",
                    PLUGIN_CATEGORY_LABELS[plugin.category],
                ]
                    .join(" ")
                    .toLowerCase();

                if (!haystack.includes(search)) {
                    return false;
                }
            }

            return true;
        });
    }, [categoryFilter, installedFilter, localPluginIds, registryPlugins, searchTerm]);

    const registryCategoryCounts = useMemo(() => {
        const counts = new Map<PluginCategory, number>();
        for (const plugin of registryPlugins) {
            counts.set(plugin.category, (counts.get(plugin.category) ?? 0) + 1);
        }
        return counts;
    }, [registryPlugins]);

    async function refreshAll() {
        setRequestState("loading");

        try {
            const [manifestResponse, profilesResponse] = await Promise.all([
                loadPluginManifests(),
                loadPluginProfiles(),
            ]);
            setPlugins(mergeCoreAndUserPluginManifests(manifestResponse.plugins));
            setProfilesPayload(profilesResponse);
            void refreshRegistry(false);
            setStatusMessage("");
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not load plugins."));
            setRequestState("error");
        }
    }

    async function refreshRegistry(showStatus = true) {
        try {
            const registry = await loadPluginRegistry();
            setRegistryPlugins(registry.plugins);
            setRegistryLoaded(true);
            setRegistryFailed(false);
        } catch (error) {
            setRegistryPlugins([]);
            setRegistryLoaded(true);
            setRegistryFailed(true);
            if (showStatus) {
                setStatusMessage(
                    messageFromError(error, "Could not load extension registry."),
                );
                setRequestState("error");
            }
        }
    }

    async function togglePlugin(plugin: PluginManifest) {
        const nextEnabled = plugin.enabled === false;
        setRequestState("loading");

        try {
            const response = await savePluginEnabled(plugin.id, nextEnabled);
            setPlugins(mergeCoreAndUserPluginManifests(response.plugins ?? []));
            setPluginEnabledState(plugin.id, nextEnabled);

            if (plugin.source === "core") {
                if (nextEnabled) {
                    await loadCoreRuntimePlugin(plugin.id);
                } else {
                    deactivatePlugin(plugin.id);
                }
            } else if (nextEnabled) {
                const nextPlugin =
                    response.plugins?.find((item) => item.id === plugin.id) ??
                    response.plugin;
                if (nextPlugin) {
                    await loadRuntimePlugin(nextPlugin);
                }
            } else {
                deactivatePlugin(plugin.id);
            }

            setStatusMessage(
                `${plugin.name} ${nextEnabled ? "enabled" : "disabled"}.${
                    plugin.source === "core" || nextEnabled || loadedState(plugin)
                        ? ""
                        : " Restart SmileyChat to load this plugin into the current session."
                }`,
            );
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not update plugin."));
            setRequestState("error");
        }
    }

    async function installStorePlugin(plugin: PluginRegistryEntry) {
        setRequestState("loading");
        setInstallingPluginId(plugin.id);

        try {
            const installResponse = await installVerifiedPlugin(plugin.id);
            let installedPlugin = installResponse.plugin;
            let nextPlugins = installResponse.plugins;

            if (installedPlugin.enabled === false) {
                const enableResponse = await savePluginEnabled(plugin.id, true);
                installedPlugin = enableResponse.plugins?.find(
                    (item) => item.id === plugin.id,
                ) ??
                    enableResponse.plugin ?? { ...installedPlugin, enabled: true };
                nextPlugins = enableResponse.plugins ?? nextPlugins;
            }

            setPlugins(mergeCoreAndUserPluginManifests(nextPlugins));
            setPluginEnabledState(plugin.id, true);
            await loadRuntimePlugin({ ...installedPlugin, enabled: true });
            setStatusMessage(`${plugin.name} installed and enabled.`);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not install extension."));
            setRequestState("error");
        } finally {
            setInstallingPluginId("");
        }
    }

    function loadedState(plugin: PluginManifest) {
        return loadedPlugins.find((item) => item.manifest.id === plugin.id);
    }

    function settingsPanelsForPlugin(pluginId: string) {
        return pluginSettingsPanels.filter(
            (panel) => pluginIdFromScopedId(panel.id) === pluginId,
        );
    }

    async function applyProfile(profile: PluginProfile) {
        if (!profilesPayload) return;
        setRequestState("loading");

        try {
            const { appliedEnabled, enabledChanges, configChanges } =
                await applyProfileToPlugins(profile, plugins);
            const refreshed = await loadPluginManifests();
            setPlugins(mergeCoreAndUserPluginManifests(refreshed.plugins));

            const nextState: PluginProfilesState = {
                version: 1,
                activeProfileId: profile.id,
                lastApplied: appliedEnabled,
                userProfiles: profilesPayload.userProfiles,
            };
            const saved = await savePluginProfilesState(nextState);
            setProfilesStateFromSave(saved.state);

            const summary =
                enabledChanges.length === 0 && configChanges.length === 0
                    ? `${profile.name} applied. No plugins needed to change.`
                    : `${profile.name} applied. ${enabledChanges.length} toggled, ${configChanges.length} config${configChanges.length === 1 ? "" : "s"} restored.`;
            setStatusMessage(summary);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not apply profile."));
            setRequestState("error");
        }
    }

    async function createNewProfile() {
        if (!profilesPayload) return;
        const name = nextProfileName("Plugin profile", allProfiles);
        const id = uniqueProfileId(name, allProfiles);

        setRequestState("loading");
        try {
            const pluginConfig = await snapshotAllPluginConfigs(plugins);
            const newProfile: PluginProfile = {
                id,
                name,
                description: "User-defined profile.",
                builtin: false,
                enabledPlugins: { ...currentEnabledMap },
                pluginConfig,
                defaultEnabled: true,
            };

            const nextState: PluginProfilesState = {
                version: 1,
                activeProfileId: id,
                lastApplied: { ...currentEnabledMap },
                userProfiles: [
                    ...profilesPayload.userProfiles.filter(
                        (profile) => profile.id !== id,
                    ),
                    newProfile,
                ],
            };
            const saved = await savePluginProfilesState(nextState);
            setProfilesStateFromSave(saved.state);
            setStatusMessage(`Created "${name}" from the current plugin state.`);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not create profile."));
            setRequestState("error");
        }
    }

    async function duplicateActiveProfile() {
        if (!profilesPayload || !activeProfile) return;
        const name = nextProfileName(`${activeProfile.name} Copy`, allProfiles);
        const id = uniqueProfileId(name, allProfiles);

        setRequestState("loading");
        try {
            const duplicated: PluginProfile = {
                ...activeProfile,
                id,
                name,
                builtin: false,
                description: activeProfile.description || "User-defined profile.",
                enabledPlugins: { ...activeProfile.enabledPlugins },
                pluginConfig: activeProfile.pluginConfig
                    ? structuredClone(activeProfile.pluginConfig)
                    : undefined,
            };
            const nextState: PluginProfilesState = {
                version: 1,
                activeProfileId: id,
                lastApplied: { ...profilesPayload.lastApplied },
                userProfiles: [...profilesPayload.userProfiles, duplicated],
            };
            const saved = await savePluginProfilesState(nextState);
            setProfilesStateFromSave(saved.state);
            setStatusMessage(`Duplicated "${activeProfile.name}" as "${name}".`);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not duplicate profile."));
            setRequestState("error");
        }
    }

    async function deleteActiveProfile() {
        if (!profilesPayload || !activeProfile || activeProfile.builtin) return;
        setRequestState("loading");
        try {
            const response = await deletePluginProfile(activeProfile.id);
            setProfilesStateFromSave(response.state);
            setStatusMessage(`Deleted "${activeProfile.name}". Active profile reset.`);
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not delete profile."));
            setRequestState("error");
        }
    }

    async function updateActiveProfileDetails(details: {
        description: string;
        name: string;
    }) {
        if (!profilesPayload || !activeProfile || activeProfile.builtin) {
            return false;
        }

        const name = details.name.trim();
        const description = details.description.trim();

        if (!name) {
            setStatusMessage("Profile name cannot be empty.");
            setRequestState("error");
            return false;
        }

        const nameTaken = allProfiles.some(
            (profile) =>
                profile.id !== activeProfile.id &&
                profile.name.trim().toLowerCase() === name.toLowerCase(),
        );

        if (nameTaken) {
            setStatusMessage(`A profile named "${name}" already exists.`);
            setRequestState("error");
            return false;
        }

        setRequestState("loading");

        try {
            const nextState: PluginProfilesState = {
                version: 1,
                activeProfileId: profilesPayload.activeProfileId,
                lastApplied: profilesPayload.lastApplied,
                userProfiles: profilesPayload.userProfiles.map((profile) =>
                    profile.id === activeProfile.id
                        ? {
                              ...profile,
                              name,
                              description: description || undefined,
                          }
                        : profile,
                ),
            };
            const saved = await savePluginProfilesState(nextState);

            setProfilesStateFromSave(saved.state);
            setStatusMessage(`Updated "${name}".`);
            setRequestState("success");
            return true;
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not update profile."));
            setRequestState("error");
            return false;
        }
    }

    return {
        activeProfile,
        activeView,
        allProfiles,
        applyProfile,
        categoryCounts,
        categoryFilter,
        createNewProfile,
        deleteActiveProfile,
        duplicateActiveProfile,
        filteredPlugins,
        filteredRegistryPlugins,
        groupedPlugins,
        installedFilter,
        installingPluginId,
        installStorePlugin,
        isCustom,
        loadedState,
        localPluginIds,
        openPluginId,
        plugins,
        refreshAll,
        refreshRegistry,
        registryCategoryCounts,
        registryFailed,
        registryLoaded,
        registryPlugins,
        registryStatusById,
        requestState,
        searchTerm,
        setActiveView,
        setCategoryFilter,
        setInstalledFilter,
        setOpenPluginId,
        setSearchTerm,
        settingsPanelsForPlugin,
        statusMessage,
        togglePlugin,
        updateActiveProfileDetails,
    };
}
