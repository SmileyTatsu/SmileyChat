import type { PluginCategory } from "./types";

export type PluginConfigSnapshot = Record<string, unknown>;

export type PluginProfile = {
    id: string;
    name: string;
    description?: string;
    builtin: boolean;
    enabledPlugins: Record<string, boolean>;
    pluginConfig?: Record<string, PluginConfigSnapshot>;
    categoryDefaults?: Partial<Record<PluginCategory, boolean>>;
    defaultEnabled?: boolean;
};

export type PluginProfilesState = {
    version: 1;
    activeProfileId: string;
    lastApplied: Record<string, boolean>;
    userProfiles: PluginProfile[];
};

export const DEFAULT_PROFILE_ID = "default";

export const BUILT_IN_PROFILES: PluginProfile[] = [
    {
        id: DEFAULT_PROFILE_ID,
        name: "Default",
        description:
            "Baseline SmileyChat setup with every plugin at its installed default. Create your own profiles with New.",
        builtin: true,
        enabledPlugins: {},
    },
];

export function getBuiltInProfile(profileId: string): PluginProfile | undefined {
    return BUILT_IN_PROFILES.find((profile) => profile.id === profileId);
}

export function resolveProfileEnabled(
    profile: PluginProfile,
    plugin: { id: string; category?: PluginCategory; defaultEnabled?: boolean },
): boolean {
    if (Object.prototype.hasOwnProperty.call(profile.enabledPlugins, plugin.id)) {
        return profile.enabledPlugins[plugin.id];
    }

    const category = plugin.category ?? "other";
    const categoryDefault = profile.categoryDefaults?.[category];

    if (typeof categoryDefault === "boolean") {
        return categoryDefault;
    }

    return profile.defaultEnabled ?? plugin.defaultEnabled ?? true;
}

export function buildAppliedEnabledMap(
    profile: PluginProfile,
    plugins: Array<{ id: string; category?: PluginCategory; defaultEnabled?: boolean }>,
): Record<string, boolean> {
    const map: Record<string, boolean> = {};

    for (const plugin of plugins) {
        map[plugin.id] = resolveProfileEnabled(profile, plugin);
    }

    return map;
}

export function isStateCustom(
    current: Record<string, boolean>,
    lastApplied: Record<string, boolean>,
): boolean {
    const ids = new Set([...Object.keys(current), ...Object.keys(lastApplied)]);

    for (const id of ids) {
        if ((current[id] ?? true) !== (lastApplied[id] ?? true)) {
            return true;
        }
    }

    return false;
}
