import { useState } from "preact/hooks";
import {
    Boxes,
    CheckCircle2,
    Download,
    ExternalLink,
    RefreshCw,
    ShieldAlert,
} from "lucide-preact";

import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";
import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { PLUGIN_CATEGORY_LABELS, type PluginManifest } from "#frontend/lib/plugins/types";

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
    isBlocked: boolean;
    onInstall: () => void | Promise<void>;
    onUpdate: () => void | Promise<void>;
};

type ConsentAction = "install" | "update";

export function StorePluginCard({
    plugin,
    installed,
    installedPlugin,
    isBusy,
    isUpdating,
    isBlocked,
    onInstall,
    onUpdate,
}: StorePluginCardProps) {
    const [consentAction, setConsentAction] = useState<ConsentAction | null>(null);
    const CategoryIcon = CATEGORY_ICONS[plugin.category];
    const canUpdate = installedPlugin?.install !== undefined;
    const permissions = plugin.permissions;
    const isConsentOpen = consentAction !== null;
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
                            {isUpdating ? "Updating..." : "Update"}
                        </button>
                    )}
                    <button
                        type="button"
                        className="plugin-install-button"
                        disabled={installed || isBlocked || isBusy || isUpdating}
                        onClick={() => setConsentAction("install")}
                    >
                        {installed ? (
                            <CheckCircle2 size={15} aria-hidden="true" />
                        ) : (
                            <Download size={15} aria-hidden="true" />
                        )}
                        {installed ? "Installed" : isBusy ? "Installing..." : "Install"}
                    </button>
                </div>
            </header>

            {plugin.description && <p>{plugin.description}</p>}

            <dl className="plugin-meta-grid">
                <div>
                    <dt>Version</dt>
                    <dd>{plugin.version}</dd>
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

            {isConsentOpen && (
                <ConfirmDialog
                    title={
                        consentAction === "install"
                            ? `Install ${plugin.name}?`
                            : `Update ${plugin.name}?`
                    }
                    icon={<ShieldAlert size={19} aria-hidden="true" />}
                    confirmLabel={consentAction === "install" ? "Install" : "Update"}
                    isBusy={isBusy || isUpdating}
                    confirmDisabled={isBlocked}
                    onConfirm={confirmConsent}
                    onClose={() => setConsentAction(null)}
                    body={
                        <>
                            <p>
                                {consentAction === "install"
                                    ? "SmileyChat will download this extension from the verified registry, install it, and enable it right away."
                                    : "This update asks for permissions the installed version did not declare."}
                            </p>
                            {consentAction === "install" ? (
                                permissions === undefined ? (
                                    <PluginPermissionUnlisted />
                                ) : permissions.length === 0 ? (
                                    <p className="plugin-permission-none">
                                        This extension declares no permissions.
                                    </p>
                                ) : (
                                    <PluginPermissionList permissions={permissions} />
                                )
                            ) : (
                                <PluginPermissionList
                                    permissions={consentPermissions}
                                    label="New permissions"
                                />
                            )}
                            <p className="plugin-permission-note">
                                Permissions describe what a plugin may use, but they are
                                not a sandbox: installed plugins run as trusted browser
                                code. Your plugin data and settings are kept.
                            </p>
                        </>
                    }
                />
            )}
        </article>
    );
}
