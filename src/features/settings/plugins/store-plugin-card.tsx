import { useState } from "preact/hooks";
import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Download,
    ExternalLink,
    RefreshCw,
    ShieldAlert,
    Trash2,
} from "lucide-preact";

import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";
import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { APP_VERSION } from "#frontend/lib/app-version";
import { pluginCompatibilityError } from "#frontend/lib/plugins/compatibility";
import { PLUGIN_CATEGORY_LABELS, type PluginManifest } from "#frontend/lib/plugins/types";
import { isNewerVersion } from "#frontend/lib/plugins/version";

import { PluginInstallConsentDialog } from "./plugin-install-consent";
import { CATEGORY_ICONS } from "./plugin-settings-helpers";
import { PluginPermissionList, PluginPermissionUnlisted } from "./plugin-permission-list";
import { findNewPluginPermissions } from "./plugin-permissions";
import { PluginTrustBadge } from "./plugin-trust-badge";

export type StorePluginCardProps = {
    plugin: PluginRegistryEntry;
    installed: boolean;
    installedPlugin?: PluginManifest;
    isBusy: boolean;
    isUpdating: boolean;
    isUninstalling: boolean;
    isBlocked: boolean;
    onInstall: () => void | Promise<void>;
    onUpdate: () => void | Promise<void>;
    onUninstall: () => void;
};

type ConsentAction = "install" | "update";

export function StorePluginCard({
    plugin,
    installed,
    installedPlugin,
    isBusy,
    isUpdating,
    isUninstalling,
    isBlocked,
    onInstall,
    onUpdate,
    onUninstall,
}: StorePluginCardProps) {
    const [consentAction, setConsentAction] = useState<ConsentAction | null>(null);
    const CategoryIcon = CATEGORY_ICONS[plugin.category];
    const managesInstalledCopy = installedPlugin?.install !== undefined;
    // The registry entry describes the artifact before it is downloaded, so an
    // incompatible plugin is shown as blocked instead of failing after install.
    const incompatibility = pluginCompatibilityError(
        {
            id: plugin.id,
            name: plugin.name,
            apiVersion: plugin.apiVersion,
            minAppVersion: plugin.minAppVersion,
        },
        APP_VERSION,
    );
    const canUpdate = Boolean(
        installed &&
        installedPlugin &&
        managesInstalledCopy &&
        !incompatibility &&
        isNewerVersion(plugin.version, installedPlugin.version),
    );
    const upToDate =
        Boolean(
            installed &&
            installedPlugin &&
            installedPlugin.install?.source === "registry",
        ) &&
        !canUpdate &&
        !incompatibility;
    const installedLocally = Boolean(
        installed && installedPlugin && !managesInstalledCopy,
    );
    const permissions = plugin.permissions;
    const consentPermissions =
        consentAction === "update"
            ? findNewPluginPermissions(plugin.permissions, installedPlugin?.permissions)
            : (permissions ?? []);

    function requestUpdate() {
        const addedPermissions = findNewPluginPermissions(
            plugin.permissions,
            installedPlugin?.permissions,
        );

        if (addedPermissions.length === 0) {
            void onUpdate();
            return;
        }

        setConsentAction("update");
    }

    async function confirmConsent() {
        const action = consentAction;
        setConsentAction(null);

        if (action === "install") {
            await onInstall();
        } else if (action === "update") {
            await onUpdate();
        }
    }

    return (
        <article className="plugin-card store-plugin-card">
            <header>
                <div className="plugin-title">
                    <Boxes size={18} />
                    <div>
                        <h3>
                            {plugin.name}
                            <PluginTrustBadge status={plugin.status} />
                            <span className="plugin-category-badge">
                                <CategoryIcon size={11} />
                                {PLUGIN_CATEGORY_LABELS[plugin.category]}
                            </span>
                            {installed && (
                                <span className="plugin-installed-badge">Installed</span>
                            )}
                        </h3>
                        <span>{plugin.id}</span>
                    </div>
                </div>
                <div className="plugin-store-actions">
                    {canUpdate && (
                        <button
                            type="button"
                            className="plugin-update-button"
                            disabled={isBlocked || isBusy || isUpdating}
                            onClick={requestUpdate}
                        >
                            <RefreshCw size={15} aria-hidden="true" />
                            {isUpdating ? "Updating..." : `Update to ${plugin.version}`}
                        </button>
                    )}
                    {upToDate && (
                        <span className="plugin-up-to-date">
                            <CheckCircle2 size={15} aria-hidden="true" />
                            Up to date
                        </span>
                    )}
                    {installedLocally && (
                        <span
                            className="plugin-up-to-date"
                            title="This plugin lives in a local development folder."
                        >
                            Installed locally
                        </span>
                    )}
                    {installed && managesInstalledCopy && (
                        <button
                            type="button"
                            className="plugin-uninstall-button"
                            disabled={isBlocked || isUpdating || isUninstalling}
                            onClick={onUninstall}
                        >
                            <Trash2 size={15} aria-hidden="true" />
                            {isUninstalling ? "Uninstalling..." : "Uninstall"}
                        </button>
                    )}
                    {!installed && (
                        <button
                            type="button"
                            className="plugin-install-button"
                            disabled={isBlocked || isBusy || Boolean(incompatibility)}
                            title={incompatibility}
                            onClick={() => setConsentAction("install")}
                        >
                            <Download size={15} aria-hidden="true" />
                            {isBusy
                                ? "Installing..."
                                : incompatibility
                                  ? "Unavailable"
                                  : "Install"}
                        </button>
                    )}
                </div>
            </header>

            {plugin.description && <p>{plugin.description}</p>}

            {incompatibility && (
                <div className="plugin-warning-panel" role="note">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <div>
                        <strong>Not compatible with this version</strong>
                        <p>{incompatibility}</p>
                    </div>
                </div>
            )}

            <dl className="plugin-meta-grid">
                <div>
                    <dt>Version</dt>
                    <dd>
                        {plugin.version}
                        {installedPlugin &&
                            installedPlugin.version !== plugin.version && (
                                <small className="plugin-version-installed">
                                    Installed {installedPlugin.version}
                                </small>
                            )}
                    </dd>
                </div>
                <div>
                    <dt>Author</dt>
                    <dd>{plugin.author ?? "Unknown"}</dd>
                </div>
                {plugin.repository && (
                    <div>
                        <dt>Repository</dt>
                        <dd>
                            <a href={plugin.repository} target="_blank" rel="noreferrer">
                                View Source
                                <ExternalLink size={13} aria-hidden="true" />
                            </a>
                        </dd>
                    </div>
                )}
            </dl>

            {permissions === undefined ? (
                <PluginPermissionUnlisted />
            ) : permissions.length === 0 ? (
                <p className="plugin-permission-none">
                    This extension declares no permissions.
                </p>
            ) : (
                <PluginPermissionList permissions={permissions} />
            )}

            {consentAction === "update" && (
                <ConfirmDialog
                    title={`Update ${plugin.name}?`}
                    icon={<ShieldAlert size={19} aria-hidden="true" />}
                    confirmLabel="Update"
                    isBusy={isBusy || isUpdating}
                    confirmDisabled={isBlocked}
                    onConfirm={confirmConsent}
                    onClose={() => setConsentAction(null)}
                    body={
                        <>
                            <p>
                                This update asks for permissions the installed version
                                did not declare.
                            </p>
                            <PluginPermissionList
                                permissions={consentPermissions}
                                label="New permissions"
                            />
                            <p className="plugin-permission-note">
                                Permissions describe what a plugin may use, but they are
                                not a sandbox: installed plugins run as trusted browser
                                code. Your plugin data and settings are kept.
                            </p>
                        </>
                    }
                />
            )}

            {consentAction === "install" && (
                <PluginInstallConsentDialog
                    plugin={plugin}
                    isBusy={isBusy}
                    confirmDisabled={isBlocked}
                    onConfirm={confirmConsent}
                    onClose={() => setConsentAction(null)}
                />
            )}

        </article>
    );
}
