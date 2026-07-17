import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
    BUILT_IN_PROFILES,
    DEFAULT_PROFILE_ID,
    type PluginProfile,
    type PluginProfilesState,
} from "#frontend/lib/plugins/profiles";

import { json, writeJsonAtomic } from "./http";
import { pluginProfilesPath } from "./paths";

type PluginProfilesResponse = {
    activeProfileId: string;
    lastApplied: Record<string, boolean>;
    customEnabledByProfile: Record<string, Record<string, boolean>>;
    builtinProfiles: PluginProfile[];
    userProfiles: PluginProfile[];
};

export async function readPluginProfilesState(): Promise<PluginProfilesState> {
    const file = Bun.file(pluginProfilesPath);

    if (!(await file.exists())) {
        return defaultPluginProfilesState();
    }

    try {
        const parsed = (await file.json()) as Partial<PluginProfilesState>;
        return normalizePluginProfilesState(parsed);
    } catch (error) {
        console.warn("Could not parse plugin-profiles.json; using defaults:", error);
        return defaultPluginProfilesState();
    }
}

export async function readPluginProfiles() {
    const state = await readPluginProfilesState();
    const response: PluginProfilesResponse = {
        activeProfileId: state.activeProfileId,
        lastApplied: state.lastApplied,
        customEnabledByProfile: state.customEnabledByProfile,
        builtinProfiles: BUILT_IN_PROFILES,
        userProfiles: state.userProfiles,
    };

    return json(response);
}

export async function writePluginProfiles(body: unknown) {
    const next = normalizePluginProfilesState(
        (body ?? {}) as Partial<PluginProfilesState>,
    );

    await mkdir(dirname(pluginProfilesPath), { recursive: true });
    await writeJsonAtomic(pluginProfilesPath, next);

    return json({ ok: true, state: next });
}

export async function deleteUserPluginProfile(profileId: string) {
    if (BUILT_IN_PROFILES.some((profile) => profile.id === profileId)) {
        return json({ error: "Built-in profiles cannot be deleted." }, 400);
    }

    const state = await readPluginProfilesState();
    const filteredUserProfiles = state.userProfiles.filter(
        (profile) => profile.id !== profileId,
    );

    if (filteredUserProfiles.length === state.userProfiles.length) {
        return json({ error: "Plugin profile not found." }, 404);
    }

    const nextActiveProfileId =
        state.activeProfileId === profileId ? DEFAULT_PROFILE_ID : state.activeProfileId;
    const nextState: PluginProfilesState = {
        ...state,
        activeProfileId: nextActiveProfileId,
        customEnabledByProfile: Object.fromEntries(
            Object.entries(state.customEnabledByProfile).filter(
                ([id]) => id !== profileId,
            ),
        ),
        userProfiles: filteredUserProfiles,
    };

    await mkdir(dirname(pluginProfilesPath), { recursive: true });
    await writeJsonAtomic(pluginProfilesPath, nextState);

    return json({ ok: true, state: nextState });
}

function defaultPluginProfilesState(): PluginProfilesState {
    return {
        version: 1,
        activeProfileId: DEFAULT_PROFILE_ID,
        lastApplied: {},
        customEnabledByProfile: {},
        userProfiles: [],
    };
}

function normalizePluginProfilesState(
    value: Partial<PluginProfilesState>,
): PluginProfilesState {
    const activeProfileId =
        typeof value.activeProfileId === "string" && value.activeProfileId.trim()
            ? value.activeProfileId.trim()
            : DEFAULT_PROFILE_ID;
    const lastApplied =
        value.lastApplied && typeof value.lastApplied === "object"
            ? normalizeEnabledMap(value.lastApplied as Record<string, unknown>)
            : {};
    const userProfiles = Array.isArray(value.userProfiles)
        ? (value.userProfiles
              .map((profile) => normalizeUserProfile(profile))
              .filter(Boolean) as PluginProfile[])
        : [];
    const customEnabledByProfile = normalizeProfileEnabledMaps(
        value.customEnabledByProfile,
    );

    return {
        version: 1,
        activeProfileId,
        lastApplied,
        customEnabledByProfile,
        userProfiles,
    };
}

function normalizeUserProfile(value: unknown): PluginProfile | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const profile = value as Record<string, unknown>;
    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    const name = typeof profile.name === "string" ? profile.name.trim() : "";

    if (!id || !name) {
        return undefined;
    }

    if (BUILT_IN_PROFILES.some((builtin) => builtin.id === id)) {
        return undefined;
    }

    return {
        id,
        name,
        description:
            typeof profile.description === "string" ? profile.description : undefined,
        builtin: false,
        enabledPlugins: normalizeEnabledMap(
            (profile.enabledPlugins as Record<string, unknown>) ?? {},
        ),
        pluginConfig: normalizePluginConfig(profile.pluginConfig),
        categoryDefaults: normalizeCategoryDefaults(profile.categoryDefaults),
        defaultEnabled:
            typeof profile.defaultEnabled === "boolean"
                ? profile.defaultEnabled
                : undefined,
    };
}

function normalizePluginConfig(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const result: Record<string, Record<string, unknown>> = {};

    for (const [pluginId, snapshot] of Object.entries(value as Record<string, unknown>)) {
        if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
            result[pluginId] = { ...(snapshot as Record<string, unknown>) };
        }
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeEnabledMap(value: Record<string, unknown>): Record<string, boolean> {
    const map: Record<string, boolean> = {};

    for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === "boolean") {
            map[key] = raw;
        }
    }

    return map;
}

function normalizeProfileEnabledMaps(
    value: unknown,
): Record<string, Record<string, boolean>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const result: Record<string, Record<string, boolean>> = {};
    for (const [profileId, enabledMap] of Object.entries(value)) {
        if (!profileId.trim() || !enabledMap || typeof enabledMap !== "object") {
            continue;
        }

        const normalized = normalizeEnabledMap(enabledMap as Record<string, unknown>);
        if (Object.keys(normalized).length > 0) {
            result[profileId] = normalized;
        }
    }

    return result;
}

function normalizeCategoryDefaults(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const result: Record<string, boolean> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === "boolean") {
            result[key] = raw;
        }
    }

    return Object.keys(result).length > 0
        ? (result as PluginProfile["categoryDefaults"])
        : undefined;
}
