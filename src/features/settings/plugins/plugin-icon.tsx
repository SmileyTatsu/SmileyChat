import { useState } from "preact/hooks";

import type { PluginCategory } from "#frontend/lib/plugins/types";

import { CATEGORY_ICONS } from "./plugin-settings-helpers";

/**
 * Muted tile tones for plugins that ship no icon.
 *
 * All eight stay inside the app's charcoal palette; they exist so a list of
 * plugins is scannable without every row falling back to the same glyph.
 */
const ICON_TONES = 8;

export function pluginIconTone(id: string) {
    // FNV-1a: cheap, and spreads the ids we ship better than `h * 31 + c`.
    let hash = 0x811c9dc5;

    for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash % ICON_TONES;
}

export function pluginInitials(name: string) {
    const initials = name
        .split(/\s+/)
        .filter((word) => /[a-z0-9]/i.test(word))
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("");

    return initials || "?";
}

export type PluginIconProps = {
    id: string;
    name: string;
    /** Resolved plugin icon (`manifest.iconUrl` or the registry `icon`). */
    iconUrl?: string;
    category?: PluginCategory;
    size?: number;
    /** Drawn instead of the monogram when the plugin declares no icon. */
    fallback?: "monogram" | "category";
};

export function PluginIcon({
    id,
    name,
    iconUrl,
    category,
    size = 28,
    fallback = "monogram",
}: PluginIconProps) {
    const [broken, setBroken] = useState(false);
    const showImage = Boolean(iconUrl) && !broken;
    const Icon = category ? CATEGORY_ICONS[category] : undefined;
    const style = {
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.round(size * 0.4)}px`,
    };

    return (
        <span
            className={`plugin-icon plugin-icon-tone-${pluginIconTone(id)}`}
            style={style}
            aria-hidden="true"
        >
            {showImage ? (
                <img
                    src={iconUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => setBroken(true)}
                />
            ) : Icon && fallback === "category" ? (
                <Icon size={Math.round(size * 0.5)} />
            ) : (
                <span>{pluginInitials(name)}</span>
            )}
        </span>
    );
}
