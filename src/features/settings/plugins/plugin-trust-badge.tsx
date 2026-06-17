import { CheckCircle2, Star } from "lucide-preact";

import type { PluginRegistryEntry } from "#frontend/lib/api/client";

export function PluginTrustBadge({ status }: { status: PluginRegistryEntry["status"] }) {
    if (status === "official") {
        return (
            <span className="plugin-trust-badge official" title="Official plugin">
                <Star size={11} aria-hidden="true" />
                Official
            </span>
        );
    }

    return (
        <span className="plugin-trust-badge verified" title="Verified community plugin">
            <CheckCircle2 size={11} aria-hidden="true" />
            Verified
        </span>
    );
}
