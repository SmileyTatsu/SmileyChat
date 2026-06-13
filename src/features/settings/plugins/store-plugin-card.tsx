import { Boxes, CheckCircle2, Download } from "lucide-preact";

import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { PLUGIN_CATEGORY_LABELS } from "#frontend/lib/plugins/types";

import { CATEGORY_ICONS } from "./plugin-settings-helpers";
import { PluginTrustBadge } from "./plugin-trust-badge";

export type StorePluginCardProps = {
    plugin: PluginRegistryEntry;
    installed: boolean;
    isBusy: boolean;
    onInstall: () => void;
};

export function StorePluginCard({
    plugin,
    installed,
    isBusy,
    onInstall,
}: StorePluginCardProps) {
    const CategoryIcon = CATEGORY_ICONS[plugin.category];

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
                <button
                    type="button"
                    className="plugin-install-button"
                    disabled={installed || isBusy}
                    onClick={onInstall}
                >
                    {installed ? <CheckCircle2 size={15} /> : <Download size={15} />}
                    {installed ? "Installed" : isBusy ? "Installing" : "Install"}
                </button>
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
            </dl>
        </article>
    );
}
