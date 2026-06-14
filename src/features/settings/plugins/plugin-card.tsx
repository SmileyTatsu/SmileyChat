import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Power,
    Settings,
    XCircle,
} from "lucide-preact";

import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import {
    getLoadedPlugins,
    getPluginSettingsPanels,
} from "#frontend/lib/plugins/registry";
import { createPluginStorage } from "#frontend/lib/plugins/runtime";
import {
    PLUGIN_CATEGORY_LABELS,
    type PluginAppSnapshot,
    type PluginCategory,
    type PluginManifest,
} from "#frontend/lib/plugins/types";

import { CATEGORY_ICONS, type RequestState } from "./plugin-settings-helpers";
import { PluginTrustBadge } from "./plugin-trust-badge";
import { PluginRenderSurface } from "../../plugins/plugin-error-boundary";

export type PluginCardProps = {
    plugin: PluginManifest;
    registryStatus?: PluginRegistryEntry["status"];
    loaded: ReturnType<typeof getLoadedPlugins>[number] | undefined;
    showConfiguration: boolean;
    settingsPanels: ReturnType<typeof getPluginSettingsPanels>;
    pluginSnapshot: PluginAppSnapshot;
    requestState: RequestState;
    onToggle: () => void;
    onToggleConfigure: () => void;
};

export function PluginCard({
    plugin,
    registryStatus,
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
    const isUnverified = plugin.source !== "core" && !registryStatus;

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
                            {registryStatus && (
                                <PluginTrustBadge status={registryStatus} />
                            )}
                            {isUnverified && (
                                <span
                                    className="plugin-trust-badge unverified"
                                    title="Unverified local plugin"
                                >
                                    <AlertTriangle size={11} />
                                    Unverified
                                </span>
                            )}
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

            {isUnverified && <UnverifiedPluginWarning plugin={plugin} />}

            <dl className="plugin-meta-grid">
                <div>
                    <dt>Version</dt>
                    <dd>{plugin.version}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd className={loaded?.status === "error" ? "plugin-error" : ""}>
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
                            <section className="plugin-config-section" key={panel.id}>
                                <h4>{panel.label}</h4>
                                <PluginRenderSurface
                                    pluginId={plugin.id}
                                    resetKey={panel.id}
                                    surface={panel.label}
                                    render={() =>
                                        panel.render({
                                            pluginId: plugin.id,
                                            snapshot: pluginSnapshot,
                                            storage: createPluginStorage(plugin.id),
                                        })
                                    }
                                />
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

function UnverifiedPluginWarning({ plugin }: { plugin: PluginManifest }) {
    const claimText =
        plugin.permissions && plugin.permissions.length > 0
            ? `While it claims to only use ${formatPermissionList(plugin.permissions)}, unverified plugins have full access to your browser, chats, and connection secrets.`
            : "Even if it declares no special permissions, unverified plugins have full access to your browser, chats, and connection secrets.";

    return (
        <div className="plugin-warning-panel" role="note">
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
                <strong>Warning: Unverified Plugin</strong>
                <p>
                    This plugin has not been reviewed by the SmileyChat team. {claimText}{" "}
                    Only install this if you completely trust the author.
                </p>
            </div>
        </div>
    );
}

function formatPermissionList(permissions: string[]) {
    const labels = permissions.map(formatPermissionName);

    if (labels.length === 1) {
        return labels[0];
    }

    if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
    }

    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatPermissionName(permission: string) {
    return permission
        .replace(/[:_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
