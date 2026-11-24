import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Power,
    RefreshCw,
    Settings,
    Trash2,
    XCircle,
} from "lucide-preact";

import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import {
    getLoadedPlugins,
    getPluginSettingsPanels,
} from "#frontend/lib/plugins/registry";
import {
    PLUGIN_CATEGORY_LABELS,
    type PluginAppSnapshot,
    type PluginCategory,
    type PluginManifest,
} from "#frontend/lib/plugins/types";
import type { GrantablePluginPermission } from "#frontend/lib/plugins/grants";

import { CATEGORY_ICONS, type RequestState } from "./plugin-settings-helpers";

import { PluginPermissionGrants } from "./plugin-permission-grants";
import { PluginPermissionList } from "./plugin-permission-list";
import { formatPluginPermissionList } from "./plugin-permissions";
import { PluginTrustBadge } from "./plugin-trust-badge";
import { ManagedPluginSettingsSection } from "./managed-plugin-settings-section";

export type PluginCardProps = {
    plugin: PluginManifest;
    registryStatus?: PluginRegistryEntry["status"];
    loaded: ReturnType<typeof getLoadedPlugins>[number] | undefined;
    showConfiguration: boolean;
    settingsPanels: ReturnType<typeof getPluginSettingsPanels>;
    pluginSnapshot: PluginAppSnapshot;
    requestState: RequestState;
    /** Registry version when it is newer than the installed manifest. */
    availableVersion?: string;
    isUpdating: boolean;
    isUninstalling?: boolean;
    onToggle: () => void;
    onUpdate: () => void;
    onUninstall?: () => void;
    onToggleConfigure?: () => void;
    /** Runtime approvals granted to this plugin (Options > Plugins). */
    grantedPermissions?: readonly string[];
    grantBusy?: boolean;
    onToggleGrant?: (permission: GrantablePluginPermission, granted: boolean) => void;
};

export function PluginCard({
    plugin,
    registryStatus,
    loaded,
    showConfiguration,
    settingsPanels,
    pluginSnapshot,
    requestState,
    availableVersion,
    isUpdating,
    isUninstalling = false,
    onToggle,
    onUpdate,
    onUninstall,
    onToggleConfigure,
    grantedPermissions = [],
    grantBusy = false,
    onToggleGrant,
}: PluginCardProps) {
    const enabled = plugin.enabled !== false;
    const category: PluginCategory = plugin.category ?? "other";
    const CategoryIcon = CATEGORY_ICONS[category];
    const sourceLabel = pluginSourceLabel(plugin, registryStatus);
    const sourceClass = pluginSourceClass(plugin, registryStatus);
    const isUnverified =
        plugin.source !== "core" &&
        (plugin.install ? plugin.install.source !== "registry" : !registryStatus);
    const canUpdate = plugin.install?.source === "registry" && Boolean(availableVersion);
    const canReinstall = plugin.install?.source === "manual-artifact";

    return (
        <article className="plugin-card">
            <header>
                <div className="plugin-title">
                    <Boxes size={18} />
                    <div>
                        <h3>
                            {plugin.name}
                            <span className={`plugin-source-badge ${sourceClass}`}>
                                {sourceLabel}
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

            {plugin.compatibilityError && (
                <div className="plugin-warning-panel" role="note">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <div>
                        <strong>Not compatible with this version</strong>
                        <p>{plugin.compatibilityError}</p>
                    </div>
                </div>
            )}

            {isUnverified && <UnverifiedPluginWarning plugin={plugin} />}

            <dl className="plugin-meta-grid">
                <div>
                    <dt>Version</dt>
                    <dd>
                        {plugin.version}
                        {availableVersion && (
                            <small className="plugin-version-update">
                                Update to {availableVersion}
                            </small>
                        )}
                    </dd>
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
                                <span title="This plugin is enabled but was not loaded in this session. Reload the page to load it.">
                                    Needs reload
                                </span>
                            </>
                        )}
                    </dd>
                </div>
            </dl>

            {plugin.permissions && plugin.permissions.length > 0 && (
                <PluginPermissionList permissions={plugin.permissions} />
            )}

            {onToggleGrant && plugin.source !== "core" && plugin.permissions && (
                <PluginPermissionGrants
                    declared={plugin.permissions}
                    granted={grantedPermissions}
                    busy={grantBusy}
                    onToggle={onToggleGrant}
                />
            )}

            <div className="plugin-card-actions">
                {canUpdate && (
                    <button
                        type="button"
                        disabled={requestState === "loading"}
                        onClick={onUpdate}
                    >
                        <RefreshCw size={15} aria-hidden="true" />
                        {isUpdating ? "Updating…" : `Update to ${availableVersion}`}
                    </button>
                )}
                {canReinstall && (
                    <button
                        type="button"
                        title="Download the stored artifact again"
                        disabled={requestState === "loading"}
                        onClick={onUpdate}
                    >
                        <RefreshCw size={15} aria-hidden="true" />
                        {isUpdating ? "Reinstalling…" : "Reinstall"}
                    </button>
                )}
                {onToggleConfigure && (
                    <button type="button" onClick={onToggleConfigure}>
                        <Settings size={15} aria-hidden="true" />
                        {showConfiguration ? "Hide Configuration" : "Configure"}
                    </button>
                )}
                {plugin.install && onUninstall && (
                    <button
                        type="button"
                        className="plugin-uninstall-button"
                        disabled={requestState === "loading" || isUninstalling}
                        onClick={onUninstall}
                    >
                        <Trash2 size={15} aria-hidden="true" />
                        {isUninstalling ? "Uninstalling…" : "Uninstall"}
                    </button>
                )}
            </div>

            {showConfiguration && (
                <div className="plugin-config-panel">
                    {settingsPanels.length > 0 ? (
                        settingsPanels.map((panel) => (
                            <ManagedPluginSettingsSection
                                key={panel.id}
                                plugin={plugin}
                                panel={panel}
                                snapshot={pluginSnapshot}
                            />
                        ))
                    ) : loaded?.status === "loaded" ? (
                        <p>This plugin does not provide custom configuration.</p>
                    ) : loaded?.status === "error" ? (
                        <p>
                            This plugin failed to load, so its configuration UI is
                            unavailable. Check the status above.
                        </p>
                    ) : enabled ? (
                        <p>Reload the page to load this plugin's configuration UI.</p>
                    ) : (
                        <p>Enable this plugin to configure it.</p>
                    )}
                </div>
            )}
        </article>
    );
}

function pluginSourceLabel(
    plugin: PluginManifest,
    registryStatus?: PluginRegistryEntry["status"],
) {
    if (plugin.source === "core") {
        return "Core";
    }

    if (plugin.install?.source === "manual-artifact") {
        return "Manual";
    }

    if (plugin.install?.source === "registry" || registryStatus) {
        return "Verified";
    }

    return "Local Folder";
}

function pluginSourceClass(
    plugin: PluginManifest,
    registryStatus?: PluginRegistryEntry["status"],
) {
    if (plugin.source === "core") {
        return "core";
    }

    if (plugin.install?.source === "manual-artifact") {
        return "manual";
    }

    if (plugin.install?.source === "registry" || registryStatus) {
        return "verified-source";
    }

    return "local-folder";
}

function UnverifiedPluginWarning({ plugin }: { plugin: PluginManifest }) {
    const claimText =
        plugin.permissions && plugin.permissions.length > 0
            ? `While it claims to only use ${formatPluginPermissionList(plugin.permissions)}, unverified plugins have full access to your browser, chats, and connection secrets.`
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
