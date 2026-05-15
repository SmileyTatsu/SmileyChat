import { Boxes, CheckCircle2, Power, RefreshCw, Settings, XCircle } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import { mergeCoreAndUserPluginManifests } from "#frontend/core-extensions";
import { loadPluginManifests, savePluginEnabled } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
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
import type { PluginAppSnapshot, PluginManifest } from "#frontend/lib/plugins/types";

type RequestState = "idle" | "loading" | "success" | "error";

type PluginsSettingsProps = {
    pluginSnapshot: PluginAppSnapshot;
};

export function PluginsSettings({ pluginSnapshot }: PluginsSettingsProps) {
    const [plugins, setPlugins] = useState<PluginManifest[]>([]);
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");
    const [openPluginId, setOpenPluginId] = useState("");
    const [, setRegistryRevision] = useState(0);
    const loadedPlugins = getLoadedPlugins();
    const pluginSettingsPanels = getPluginSettingsPanels();

    useEffect(() => {
        void refreshPlugins();
    }, []);

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    async function refreshPlugins() {
        setRequestState("loading");

        try {
            const response = await loadPluginManifests();
            const nextPlugins = mergeCoreAndUserPluginManifests(response.plugins);
            setPlugins(nextPlugins);
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
                        : " Restart ScyllaChat to load this plugin into the current session."
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

    return (
        <section className="tool-window">
            <div className="plugins-heading">
                <div>
                    <h2>Plugins</h2>
                    <p>
                        Core extensions and trusted local plugins loaded from
                        userData/plugins.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={requestState === "loading"}
                    onClick={() => void refreshPlugins()}
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            <div className="plugins-list">
                {plugins.map((plugin) => {
                    const loaded = loadedState(plugin);
                    const enabled = plugin.enabled !== false;
                    const settingsPanels = settingsPanelsForPlugin(plugin.id);
                    const showConfiguration = openPluginId === plugin.id;

                    return (
                        <article className="plugin-card" key={plugin.id}>
                            <header>
                                <div className="plugin-title">
                                    <Boxes size={18} />
                                    <div>
                                        <h3>
                                            {plugin.name}
                                            <span
                                                className={`plugin-source-badge ${
                                                    plugin.source === "core"
                                                        ? "core"
                                                        : "local"
                                                }`}
                                            >
                                                {plugin.source === "core"
                                                    ? "Core"
                                                    : "Local"}
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
                                        onChange={() => void togglePlugin(plugin)}
                                    />
                                    <span
                                        className="plugin-toggle-track"
                                        aria-hidden="true"
                                    >
                                        <span />
                                    </span>
                                    <span>{enabled ? "Enabled" : "Disabled"}</span>
                                </label>
                            </header>

                            {plugin.description && <p>{plugin.description}</p>}

                            <dl className="plugin-meta-grid">
                                <div>
                                    <dt>Source</dt>
                                    <dd>
                                        {plugin.source === "core"
                                            ? "Core extension"
                                            : "Local plugin"}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Version</dt>
                                    <dd>{plugin.version}</dd>
                                </div>
                                <div>
                                    <dt>Status</dt>
                                    <dd
                                        className={
                                            loaded?.status === "error"
                                                ? "plugin-error"
                                                : ""
                                        }
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
                                <div>
                                    <dt>Main</dt>
                                    <dd>{plugin.main}</dd>
                                </div>
                                <div>
                                    <dt>Styles</dt>
                                    <dd>
                                        {plugin.styles?.length
                                            ? plugin.styles.join(", ")
                                            : "None"}
                                    </dd>
                                </div>
                            </dl>

                            <div className="plugin-permissions">
                                <span>Permissions</span>
                                <div>
                                    {(plugin.permissions?.length
                                        ? plugin.permissions
                                        : ["none"]
                                    ).map((permission) => (
                                        <code key={permission}>{permission}</code>
                                    ))}
                                </div>
                            </div>

                            <div className="plugin-card-actions">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpenPluginId((current) =>
                                            current === plugin.id ? "" : plugin.id,
                                        )
                                    }
                                >
                                    <Settings size={15} />
                                    {showConfiguration
                                        ? "Hide configuration"
                                        : "Configure"}
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
                                                    storage: createPluginStorage(
                                                        plugin.id,
                                                    ),
                                                })}
                                            </section>
                                        ))
                                    ) : loaded?.status === "loaded" ? (
                                        <p>
                                            This plugin does not provide custom
                                            configuration.
                                        </p>
                                    ) : enabled ? (
                                        <p>
                                            Restart ScyllaChat to load this plugin's
                                            configuration UI.
                                        </p>
                                    ) : (
                                        <p>
                                            Enable this plugin and restart ScyllaChat to
                                            configure it.
                                        </p>
                                    )}
                                </div>
                            )}
                        </article>
                    );
                })}

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

function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}
