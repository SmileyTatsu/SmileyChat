import {
    ArrowLeftRight,
    BookOpen,
    Bot,
    Boxes,
    Layout,
    Plug,
    Wrench,
} from "lucide-preact";
import type { FunctionComponent } from "preact";

import { BUILT_IN_PROFILES, type PluginProfile } from "#frontend/lib/plugins/profiles";
import type { PluginCategory } from "#frontend/lib/plugins/types";

export type RequestState = "idle" | "loading" | "success" | "error";
export type InstalledFilter = "all" | "installed" | "not-installed";
export type PluginsView = "local" | "store";

export const CATEGORY_ICONS: Record<
    PluginCategory,
    FunctionComponent<{ size?: number | string }>
> = {
    interface: Layout,
    "input-output": ArrowLeftRight,
    automation: Bot,
    connections: Plug,
    tools: Wrench,
    "memory-lore": BookOpen,
    other: Boxes,
};

export function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

export function nextProfileName(baseName: string, profiles: PluginProfile[]) {
    const names = new Set(profiles.map((profile) => profile.name));

    if (!names.has(baseName)) {
        return baseName;
    }

    for (let index = 2; index < 1000; index += 1) {
        const name = `${baseName} ${index}`;

        if (!names.has(name)) {
            return name;
        }
    }

    return `${baseName} ${Date.now()}`;
}

export function uniqueProfileId(name: string, profiles: PluginProfile[]) {
    const ids = new Set(profiles.map((profile) => profile.id));
    const baseId = slugify(name) || `profile-${Date.now()}`;
    const isReserved = (id: string) =>
        ids.has(id) || BUILT_IN_PROFILES.some((profile) => profile.id === id);

    if (!isReserved(baseId)) {
        return baseId;
    }

    for (let index = 2; index < 1000; index += 1) {
        const id = `${baseId}-${index}`;

        if (!isReserved(id)) {
            return id;
        }
    }

    return `${baseId}-${Date.now()}`;
}
