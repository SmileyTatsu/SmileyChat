import {
    AlertTriangle,
    Boxes,
    Layers,
    RefreshCw,
    Search,
    XCircle,
} from "lucide-preact";

import {
    PLUGIN_CATEGORIES,
    PLUGIN_CATEGORY_LABELS,
    type PluginAppSnapshot,
} from "#frontend/lib/plugins/types";

import { PluginCard } from "./plugins/plugin-card";
import { ProfileBar } from "./plugins/profile-bar";
import { CATEGORY_ICONS } from "./plugins/plugin-settings-helpers";
import { StorePluginCard } from "./plugins/store-plugin-card";
import { usePluginSettings } from "./plugins/use-plugin-settings";

type PluginsSettingsProps = {
    pluginSnapshot: PluginAppSnapshot;
};

export function PluginsSettings({ pluginSnapshot }: PluginsSettingsProps) {
    const pluginSettings = usePluginSettings();
    const {
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
    } = pluginSettings;
    const unverifiedLocalPlugins = plugins.filter(
        (plugin) => plugin.source !== "core" && !registryStatusById.has(plugin.id),
    );
    const enabledUnverifiedCount = unverifiedLocalPlugins.filter(
        (plugin) => plugin.enabled !== false,
    ).length;

    return (
        <section className="tool-window plugins-settings">
            <header className="settings-section-heading plugins-heading">
                <div>
                    <h2>Plugins</h2>
                    <p>
                        Core extensions and trusted local plugins. Switch profiles to tune
                        the engine for the experience you want.
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

            <div className="plugins-view-switcher">
                {(
                    [
                        ["local", "Local Plugins"],
                        ["store", "Extension Store"],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className={activeView === value ? "active" : ""}
                        onClick={() => {
                            setActiveView(value);
                            if (value === "store" && !registryLoaded) {
                                void refreshRegistry();
                            }
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {activeView === "local" && (
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
            )}

            {activeView === "local" && unverifiedLocalPlugins.length > 0 && (
                <div className="plugin-global-warning" role="note">
                    <AlertTriangle size={17} aria-hidden="true" />
                    <p>
                        {enabledUnverifiedCount > 0
                            ? `${enabledUnverifiedCount} unverified local plugin${
                                  enabledUnverifiedCount === 1 ? " is" : "s are"
                              } enabled.`
                            : "Unverified local plugins are installed."}{" "}
                        Local plugins run as trusted browser code and can read chats,
                        app state, and connection secrets. Only enable plugins from
                        authors you trust.
                    </p>
                </div>
            )}

            <div className="marketplace-toolbar">
                <input
                    type="search"
                    className="marketplace-search"
                    value={searchTerm}
                    placeholder="Search extensions..."
                    onInput={(event) =>
                        setSearchTerm((event.currentTarget as HTMLInputElement).value)
                    }
                />
                <div className="marketplace-filter-pills">
                    {(
                        [
                            ["all", "All"],
                            [
                                "installed",
                                activeView === "store" ? "Installed" : "Enabled",
                            ],
                            [
                                "not-installed",
                                activeView === "store" ? "Available" : "Disabled",
                            ],
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
                    <span className="category-tab-count">
                        {activeView === "store" ? registryPlugins.length : plugins.length}
                    </span>
                </button>
                {PLUGIN_CATEGORIES.map((category) => {
                    const Icon = CATEGORY_ICONS[category];
                    const count =
                        activeView === "store"
                            ? (registryCategoryCounts.get(category) ?? 0)
                            : (categoryCounts.get(category) ?? 0);
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

            {activeView === "local" ? (
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
                                    registryStatus={registryStatusById.get(plugin.id)}
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
                            <p>
                                Place local plugins in userData/plugins to install them.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="plugins-list">
                    {filteredRegistryPlugins.map((plugin) => (
                        <StorePluginCard
                            key={plugin.id}
                            plugin={plugin}
                            installed={localPluginIds.has(plugin.id)}
                            isBusy={
                                requestState === "loading" &&
                                installingPluginId === plugin.id
                            }
                            onInstall={() => void installStorePlugin(plugin)}
                        />
                    ))}

                    {registryFailed && (
                        <div className="empty-plugin-state">
                            <XCircle size={20} />
                            <p>Extension registry is unavailable.</p>
                        </div>
                    )}

                    {!registryFailed && filteredRegistryPlugins.length === 0 && (
                        <div className="empty-plugin-state">
                            <Search size={20} />
                            <p>No extensions match these filters.</p>
                        </div>
                    )}
                </div>
            )}

            {statusMessage && (
                <p className={`connection-status ${requestState}`}>{statusMessage}</p>
            )}
        </section>
    );
}
