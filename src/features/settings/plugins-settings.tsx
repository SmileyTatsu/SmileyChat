import {
    ArrowLeftRight,
    BookOpen,
    Bot,
    Boxes,
    CheckCircle2,
    Copy,
    Layers,
    Layout,
    Pencil,
    Plug,
    Plus,
    Power,
    RefreshCw,
    Search,
    Settings,
    Sparkles,
    Trash2,
    Wrench,
    XCircle,
} from "lucide-preact";
import type { FunctionComponent } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import { mergeCoreAndUserPluginManifests } from "#frontend/core-extensions";
import {
    deletePluginProfile,
    loadPluginManifests,
    loadPluginProfiles,
    savePluginEnabled,
    savePluginProfilesState,
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
import {
    createPluginStorage,
    loadCoreRuntimePlugin,
    loadRuntimePlugin,
} from "#frontend/lib/plugins/runtime";
import {
    PLUGIN_CATEGORIES,
    PLUGIN_CATEGORY_LABELS,
    type PluginAppSnapshot,
    type PluginCategory,
    type PluginManifest,
} from "#frontend/lib/plugins/types";

type RequestState = "idle" | "loading" | "success" | "error";

type PluginsSettingsProps = {
    pluginSnapshot: PluginAppSnapshot;
};

type InstalledFilter = "all" | "installed" | "not-installed";

const CATEGORY_ICONS: Record<
    PluginCategory,
    FunctionComponent<{ size?: number | string }>
> = {
    interface: Layout,
    "input-output": ArrowLeftRight,
    automation: Bot,
    connections: Plug,
    tools: Wrench,
    "memory-lore": BookOpen,
    other: Boxes,
};

export function PluginsSettings({ pluginSnapshot }: PluginsSettingsProps) {
    const [plugins, setPlugins] = useState<PluginManifest[]>([]);
    const [profilesPayload, setProfilesPayload] =
        useState<PluginProfilesPayload | null>(null);
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [openPluginId, setOpenPluginId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [installedFilter, setInstalledFilter] = useState<InstalledFilter>("all");
    const [categoryFilter, setCategoryFilter] = useState<PluginCategory | "all">("all");
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

    async function refreshAll() {
        setRequestState("loading");

        try {
            const [manifestResponse, profilesResponse] = await Promise.all([
                loadPluginManifests(),
                loadPluginProfiles(),
            ]);
            setPlugins(mergeCoreAndUserPluginManifests(manifestResponse.plugins));
            setProfilesPayload(profilesResponse);
            setStatusMessage("");
            setRequestState("success");
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not load plugins."));
            setRequestState("error");
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
            setProfilesPayload({
                activeProfileId: saved.state.activeProfileId,
                lastApplied: saved.state.lastApplied,
                builtinProfiles: profilesPayload.builtinProfiles,
                userProfiles: saved.state.userProfiles,
            });

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
                    ...profilesPayload.userProfiles.filter((profile) => profile.id !== id),
                    newProfile,
                ],
            };
            const saved = await savePluginProfilesState(nextState);
            setProfilesPayload({
                activeProfileId: saved.state.activeProfileId,
                lastApplied: saved.state.lastApplied,
                builtinProfiles: profilesPayload.builtinProfiles,
                userProfiles: saved.state.userProfiles,
            });
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
            setProfilesPayload({
                activeProfileId: saved.state.activeProfileId,
                lastApplied: saved.state.lastApplied,
                builtinProfiles: profilesPayload.builtinProfiles,
                userProfiles: saved.state.userProfiles,
            });
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
            setProfilesPayload({
                activeProfileId: response.state.activeProfileId,
                lastApplied: response.state.lastApplied,
                builtinProfiles: profilesPayload.builtinProfiles,
                userProfiles: response.state.userProfiles,
            });
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

            setProfilesPayload({
                activeProfileId: saved.state.activeProfileId,
                lastApplied: saved.state.lastApplied,
                builtinProfiles: profilesPayload.builtinProfiles,
                userProfiles: saved.state.userProfiles,
            });
            setStatusMessage(`Updated "${name}".`);
            setRequestState("success");
            return true;
        } catch (error) {
            setStatusMessage(messageFromError(error, "Could not update profile."));
            setRequestState("error");
            return false;
        }
    }

    return (
        <section className="tool-window plugins-settings">
            <header className="settings-section-heading plugins-heading">
                <div>
                    <h2>Plugins</h2>
                    <p>
                        Core extensions and trusted local plugins. Switch profiles to
                        tune the engine for the experience you want.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={requestState === "loading"}
                    onClick={() => void refreshAll()}
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </header>

            <ProfileBar
                profiles={allProfiles}
                activeProfile={activeProfile}
                isCustom={isCustom}
                isBusy={requestState === "loading"}
                onApply={applyProfile}
                onCreateNew={() => void createNewProfile()}
                onDuplicateActive={() => void duplicateActiveProfile()}
                onDeleteActive={deleteActiveProfile}
                onUpdateActiveDetails={updateActiveProfileDetails}
            />

            <div className="marketplace-toolbar">
                <input
                    type="search"
                    className="marketplace-search"
                    value={searchTerm}
                    placeholder="Search extensions..."
                    onInput={(event) =>
                        setSearchTerm(
                            (event.currentTarget as HTMLInputElement).value,
                        )
                    }
                />
                <div className="marketplace-filter-pills">
                    {(
                        [
                            ["all", "All"],
                            ["installed", "Enabled"],
                            ["not-installed", "Disabled"],
                        ] as const
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            className={
                                installedFilter === value ? "pill pill-active" : "pill"
                            }
                            onClick={() => setInstalledFilter(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="marketplace-category-tabs">
                <button
                    type="button"
                    className={
                        categoryFilter === "all"
                            ? "category-tab category-tab-active"
                            : "category-tab"
                    }
                    onClick={() => setCategoryFilter("all")}
                >
                    <Layers size={14} />
                    All
                    <span className="category-tab-count">{plugins.length}</span>
                </button>
                {PLUGIN_CATEGORIES.map((category) => {
                    const Icon = CATEGORY_ICONS[category];
                    const count = categoryCounts.get(category) ?? 0;
                    if (count === 0) return null;
                    return (
                        <button
                            key={category}
                            type="button"
                            className={
                                categoryFilter === category
                                    ? "category-tab category-tab-active"
                                    : "category-tab"
                            }
                            onClick={() => setCategoryFilter(category)}
                        >
                            <Icon size={14} />
                            {PLUGIN_CATEGORY_LABELS[category]}
                            <span className="category-tab-count">{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="plugins-list">
                {groupedPlugins.map(([category, list]) => (
                    <div className="plugin-category-group" key={category}>
                        {categoryFilter === "all" && (
                            <h3 className="plugin-category-heading">
                                {(() => {
                                    const Icon = CATEGORY_ICONS[category];
                                    return <Icon size={15} />;
                                })()}
                                {PLUGIN_CATEGORY_LABELS[category]}
                                <span>{list.length}</span>
                            </h3>
                        )}
                        {list.map((plugin) => (
                            <PluginCard
                                key={plugin.id}
                                plugin={plugin}
                                loaded={loadedState(plugin)}
                                showConfiguration={openPluginId === plugin.id}
                                settingsPanels={settingsPanelsForPlugin(plugin.id)}
                                pluginSnapshot={pluginSnapshot}
                                requestState={requestState}
                                onToggle={() => void togglePlugin(plugin)}
                                onToggleConfigure={() =>
                                    setOpenPluginId((current) =>
                                        current === plugin.id ? "" : plugin.id,
                                    )
                                }
                            />
                        ))}
                    </div>
                ))}

                {filteredPlugins.length === 0 && plugins.length > 0 && (
                    <div className="empty-plugin-state">
                        <Search size={20} />
                        <p>No extensions match these filters.</p>
                    </div>
                )}

                {plugins.length === 0 && (
                    <div className="empty-plugin-state">
                        <Boxes size={20} />
                        <p>Place local plugins in userData/plugins to install them.</p>
                    </div>
                )}
            </div>

            {statusMessage && (
                <p className={`connection-status ${requestState}`}>{statusMessage}</p>
            )}
        </section>
    );
}

type ProfileBarProps = {
    profiles: PluginProfile[];
    activeProfile: PluginProfile | undefined;
    isCustom: boolean;
    isBusy: boolean;
    onApply: (profile: PluginProfile) => void | Promise<void>;
    onCreateNew: () => void | Promise<void>;
    onDuplicateActive: () => void | Promise<void>;
    onDeleteActive: () => void | Promise<void>;
    onUpdateActiveDetails: (details: {
        description: string;
        name: string;
    }) => boolean | Promise<boolean>;
};

function ProfileBar({
    profiles,
    activeProfile,
    isCustom,
    isBusy,
    onApply,
    onCreateNew,
    onDuplicateActive,
    onDeleteActive,
    onUpdateActiveDetails,
}: ProfileBarProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftName, setDraftName] = useState(activeProfile?.name ?? "");
    const [draftDescription, setDraftDescription] = useState(
        activeProfile?.description ?? "",
    );
    const canEditProfile = Boolean(activeProfile && !activeProfile.builtin);

    useEffect(() => {
        setDraftName(activeProfile?.name ?? "");
        setDraftDescription(activeProfile?.description ?? "");
        setIsEditing(false);
    }, [activeProfile?.id, activeProfile?.name, activeProfile?.description]);

    async function saveDetails() {
        if (!activeProfile || activeProfile.builtin) return;
        const saved = await onUpdateActiveDetails({
            description: draftDescription,
            name: draftName,
        });

        if (saved) {
            setIsEditing(false);
        }
    }

    return (
        <section className="profile-bar">
            <div className="profile-bar-row">
                <label className="profile-bar-select">
                    <span>
                        <Sparkles size={14} />
                        Profile
                    </span>
                    <select
                        value={activeProfile?.id ?? ""}
                        disabled={isBusy}
                        onInput={(event) => {
                            const id = (event.currentTarget as HTMLSelectElement).value;
                            const next = profiles.find((profile) => profile.id === id);
                            if (next) void onApply(next);
                        }}
                    >
                        <optgroup label="Built-in">
                            {profiles
                                .filter((profile) => profile.builtin)
                                .map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name}
                                    </option>
                                ))}
                        </optgroup>
                        {profiles.some((profile) => !profile.builtin) && (
                            <optgroup label="Yours">
                                {profiles
                                    .filter((profile) => !profile.builtin)
                                    .map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                            </optgroup>
                        )}
                    </select>
                </label>

                {isCustom && (
                    <span className="custom-badge" title="State diverges from this profile">
                        Custom
                    </span>
                )}

                <div className="button-row profile-bar-actions">
                    <button type="button" disabled={isBusy} onClick={onCreateNew}>
                        <Plus size={16} />
                        New
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !activeProfile}
                        onClick={onDuplicateActive}
                    >
                        <Copy size={16} />
                        Duplicate
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !canEditProfile}
                        onClick={() => setIsEditing((value) => !value)}
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        type="button"
                        className="danger-button"
                        disabled={isBusy || !activeProfile || activeProfile.builtin}
                        onClick={onDeleteActive}
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                </div>
            </div>

            {activeProfile?.description && (
                <p className="profile-bar-description">{activeProfile.description}</p>
            )}

            {isEditing && canEditProfile && (
                <div className="profile-bar-editor">
                    <label>
                        Name
                        <input
                            type="text"
                            value={draftName}
                            onInput={(event) =>
                                setDraftName(event.currentTarget.value)
                            }
                        />
                    </label>
                    <label>
                        Description
                        <textarea
                            rows={2}
                            value={draftDescription}
                            onInput={(event) =>
                                setDraftDescription(event.currentTarget.value)
                            }
                        />
                    </label>
                    <div className="button-row profile-bar-editor-actions">
                        <button
                            type="button"
                            disabled={isBusy || draftName.trim().length === 0}
                            onClick={() => void saveDetails()}
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                                setDraftName(activeProfile?.name ?? "");
                                setDraftDescription(
                                    activeProfile?.description ?? "",
                                );
                                setIsEditing(false);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

        </section>
    );
}

type PluginCardProps = {
    plugin: PluginManifest;
    loaded: ReturnType<typeof getLoadedPlugins>[number] | undefined;
    showConfiguration: boolean;
    settingsPanels: ReturnType<typeof getPluginSettingsPanels>;
    pluginSnapshot: PluginAppSnapshot;
    requestState: RequestState;
    onToggle: () => void;
    onToggleConfigure: () => void;
};

function PluginCard({
    plugin,
    loaded,
    showConfiguration,
    settingsPanels,
    pluginSnapshot,
    requestState,
    onToggle,
    onToggleConfigure,
}: PluginCardProps) {
    const enabled = plugin.enabled !== false;
    const category: PluginCategory = plugin.category ?? "other";
    const CategoryIcon = CATEGORY_ICONS[category];

    return (
        <article className="plugin-card">
            <header>
                <div className="plugin-title">
                    <Boxes size={18} />
                    <div>
                        <h3>
                            {plugin.name}
                            <span
                                className={`plugin-source-badge ${plugin.source === "core" ? "core" : "local"}`}
                            >
                                {plugin.source === "core" ? "Core" : "Local"}
                            </span>
                            <span className="plugin-category-badge">
                                <CategoryIcon size={11} />
                                {PLUGIN_CATEGORY_LABELS[category]}
                            </span>
                        </h3>
                        <span>{plugin.id}</span>
                    </div>
                </div>
                <label className="plugin-toggle">
                    <input
                        type="checkbox"
                        checked={enabled}
                        disabled={requestState === "loading"}
                        onChange={onToggle}
                    />
                    <span className="plugin-toggle-track" aria-hidden="true">
                        <span />
                    </span>
                    <span>{enabled ? "Enabled" : "Disabled"}</span>
                </label>
            </header>

            {plugin.description && <p>{plugin.description}</p>}

            <dl className="plugin-meta-grid">
                <div>
                    <dt>Version</dt>
                    <dd>{plugin.version}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd
                        className={loaded?.status === "error" ? "plugin-error" : ""}
                    >
                        {plugin.source === "core" &&
                        enabled &&
                        loaded?.status === "loaded" ? (
                            <>
                                <CheckCircle2 size={14} />
                                Built in
                            </>
                        ) : !enabled ? (
                            "Off"
                        ) : loaded ? (
                            loaded.status === "loaded" ? (
                                <>
                                    <CheckCircle2 size={14} />
                                    Loaded
                                </>
                            ) : (
                                <>
                                    <XCircle size={14} />
                                    {loaded.error ?? "Load error"}
                                </>
                            )
                        ) : (
                            <>
                                <Power size={14} />
                                Pending restart
                            </>
                        )}
                    </dd>
                </div>
            </dl>

            {plugin.permissions && plugin.permissions.length > 0 && (
                <div className="plugin-permissions">
                    <span>Permissions</span>
                    <div>
                        {plugin.permissions.map((permission) => (
                            <code key={permission}>{permission}</code>
                        ))}
                    </div>
                </div>
            )}

            <div className="plugin-card-actions">
                <button type="button" onClick={onToggleConfigure}>
                    <Settings size={15} />
                    {showConfiguration ? "Hide configuration" : "Configure"}
                </button>
            </div>

            {showConfiguration && (
                <div className="plugin-config-panel">
                    {settingsPanels.length > 0 ? (
                        settingsPanels.map((panel) => (
                            <section
                                className="plugin-config-section"
                                key={panel.id}
                            >
                                <h4>{panel.label}</h4>
                                {panel.render({
                                    pluginId: plugin.id,
                                    snapshot: pluginSnapshot,
                                    storage: createPluginStorage(plugin.id),
                                })}
                            </section>
                        ))
                    ) : loaded?.status === "loaded" ? (
                        <p>This plugin does not provide custom configuration.</p>
                    ) : enabled ? (
                        <p>Restart SmileyChat to load this plugin's configuration UI.</p>
                    ) : (
                        <p>Enable this plugin and restart SmileyChat to configure it.</p>
                    )}
                </div>
            )}
        </article>
    );
}

function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function nextProfileName(baseName: string, profiles: PluginProfile[]) {
    const names = new Set(profiles.map((profile) => profile.name));

    if (!names.has(baseName)) {
        return baseName;
    }

    for (let index = 2; index < 1000; index += 1) {
        const name = `${baseName} ${index}`;

        if (!names.has(name)) {
            return name;
        }
    }

    return `${baseName} ${Date.now()}`;
}

function uniqueProfileId(name: string, profiles: PluginProfile[]) {
    const ids = new Set(profiles.map((profile) => profile.id));
    const baseId = slugify(name) || `profile-${Date.now()}`;
    const isReserved = (id: string) =>
        ids.has(id) || BUILT_IN_PROFILES.some((profile) => profile.id === id);

    if (!isReserved(baseId)) {
        return baseId;
    }

    for (let index = 2; index < 1000; index += 1) {
        const id = `${baseId}-${index}`;

        if (!isReserved(id)) {
            return id;
        }
    }

    return `${baseId}-${Date.now()}`;
}
