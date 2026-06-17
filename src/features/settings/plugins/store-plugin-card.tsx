import { Boxes, CheckCircle2, Download, ExternalLink, RefreshCw } from "lucide-preact";

import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { PLUGIN_CATEGORY_LABELS, type PluginManifest } from "#frontend/lib/plugins/types";

import { CATEGORY_ICONS } from "./plugin-settings-helpers";
import { PluginTrustBadge } from "./plugin-trust-badge";

export type StorePluginCardProps = {
    plugin: PluginRegistryEntry;
    installed: boolean;
    installedPlugin?: PluginManifest;
    isBusy: boolean;
    isUpdating: boolean;
    isBlocked: boolean;
    onInstall: () => void;
    onUpdate: () => void;
};

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
    const CategoryIcon = CATEGORY_ICONS[plugin.category];
    const canUpdate = installedPlugin?.install !== undefined;

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
                            onClick={onUpdate}
                        >
                            <RefreshCw size={15} aria-hidden="true" />
                            {isUpdating ? "Updating..." : "Update"}
                        </button>
                    )}
                    <button
                        type="button"
                        className="plugin-install-button"
                        disabled={installed || isBlocked || isBusy || isUpdating}
                        onClick={onInstall}
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
        </article>
    );
}
