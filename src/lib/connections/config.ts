import { isRecord } from "../common/guards";
import {
    defaultContextTokenBudget,
    normalizeContextTokenBudget,
} from "../presets/context-budget-constants";
import { stringOrUndefined } from "./config-utils";
import { defaultAnthropicConfig, normalizeAnthropicConfig } from "./anthropic/config";

import type { AnthropicConnectionConfig } from "./anthropic/types";
import { defaultGoogleAIConfig, normalizeGoogleAIConfig } from "./google-ai/config";
import type { GoogleAIConnectionConfig } from "./google-ai/types";
import { defaultNovelAIConfig, normalizeNovelAIConfig } from "./novelai/config";
import type { NovelAIConnectionConfig } from "./novelai/types";
import {
    defaultOpenAICompatibleConfig,
    normalizeOpenAICompatibleConfig,
} from "./openai-compatible/config";
import type { OpenAICompatibleConnectionConfig } from "./openai-compatible/types";
import { defaultOpenRouterConfig, normalizeOpenRouterConfig } from "./openrouter/config";
import type { OpenRouterConnectionConfig } from "./openrouter/types";

export type ConnectionProviderId =
    | "openai-compatible"
    | "openrouter"
    | "google-ai"
    | "anthropic"
    | "novelai"
    | (string & {});

export type OpenAICompatibleConnectionProfile = {
    id: string;
    name: string;
    provider: "openai-compatible";
    contextTokenBudget: number;
    config: OpenAICompatibleConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type OpenRouterConnectionProfile = {
    id: string;
    name: string;
    provider: "openrouter";
    contextTokenBudget: number;
    config: OpenRouterConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type GoogleAIConnectionProfile = {
    id: string;
    name: string;
    provider: "google-ai";
    contextTokenBudget: number;
    config: GoogleAIConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type AnthropicConnectionProfile = {
    id: string;
    name: string;
    provider: "anthropic";
    contextTokenBudget: number;
    config: AnthropicConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type NovelAIConnectionProfile = {
    id: string;
    name: string;
    provider: "novelai";
    contextTokenBudget: number;
    config: NovelAIConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type PluginConnectionProfile = {
    id: string;
    name: string;
    provider: Exclude<
        ConnectionProviderId,
        "openai-compatible" | "openrouter" | "google-ai" | "anthropic" | "novelai"
    >;
    contextTokenBudget: number;
    config: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type ConnectionProfile =
    | OpenAICompatibleConnectionProfile
    | OpenRouterConnectionProfile
    | GoogleAIConnectionProfile
    | AnthropicConnectionProfile
    | NovelAIConnectionProfile
    | PluginConnectionProfile;

export type ConnectionSettings = {
    version: 1;
    activeProfileId: string;
    profiles: ConnectionProfile[];
};

export type ConnectionSecrets = {
    version: 1;
    profiles: Record<
        string,
        {
            apiKey?: string;
        }
    >;
};

const migratedOpenAIProfileId = "profile-openai-compatible-default";

export {
    defaultAnthropicConfig,
    defaultGoogleAIConfig,
    defaultNovelAIConfig,
    defaultOpenAICompatibleConfig,
    defaultOpenRouterConfig,
};

export const defaultConnectionSettings: ConnectionSettings = {
    version: 1,
    activeProfileId: migratedOpenAIProfileId,
    profiles: [
        {
            id: migratedOpenAIProfileId,
            name: "OpenAI",
            provider: "openai-compatible",
            contextTokenBudget: defaultContextTokenBudget,
            config: defaultOpenAICompatibleConfig,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        },
    ],
};

export const defaultConnectionSecrets: ConnectionSecrets = {
    version: 1,
    profiles: {},
};

export function normalizeConnectionSettings(value: unknown): ConnectionSettings {
    const settings = isRecord(value) ? value : {};

    if (Array.isArray(settings.profiles)) {
        return normalizeProfileSettings(settings);
    }

    return migrateLegacySettings(settings);
}

export function normalizeConnectionSecrets(value: unknown): ConnectionSecrets {
    const secrets = isRecord(value) ? value : {};

    if (isRecord(secrets.profiles)) {
        const profiles: ConnectionSecrets["profiles"] = {};

        for (const [profileId, profileSecrets] of Object.entries(secrets.profiles)) {
            if (!isRecord(profileSecrets)) {
                continue;
            }

            const apiKey = stringOrUndefined(profileSecrets.apiKey);

            profiles[profileId] = apiKey ? { apiKey } : {};
        }

        return {
            version: 1,
            profiles,
        };
    }

    return migrateLegacySecrets(secrets);
}

export function sanitizeConnectionSettings(value: unknown): ConnectionSettings {
    const settings = normalizeConnectionSettings(value);

    return {
        ...settings,
        profiles: settings.profiles.map((profile) => ({
            ...profile,
            config: {
                ...profile.config,
                apiKey: undefined,
            },
        })),
    };
}

export function sanitizeConnectionSecrets(value: unknown): ConnectionSecrets {
    return normalizeConnectionSecrets(value);
}

export function extractConnectionSecrets(
    settings: ConnectionSettings,
): ConnectionSecrets {
    const profiles: ConnectionSecrets["profiles"] = {};

    for (const profile of settings.profiles) {
        const apiKey = stringOrUndefined(
            "apiKey" in profile.config ? profile.config.apiKey : undefined,
        );
        profiles[profile.id] = apiKey ? { apiKey } : {};
    }

    return {
        version: 1,
        profiles,
    };
}

export function applyConnectionSecrets(
    settings: ConnectionSettings,
    secrets: ConnectionSecrets,
): ConnectionSettings {
    return {
        ...settings,
        profiles: settings.profiles.map((profile) => ({
            ...profile,
            config: {
                ...profile.config,
                apiKey: secrets.profiles[profile.id]?.apiKey,
            },
        })),
    };
}

export function createConnectionProfile(
    provider: ConnectionProviderId,
    name = "New connection",
    defaultConfig?: Record<string, unknown>,
): ConnectionProfile {
    const now = new Date().toISOString();

    if (provider === "openrouter") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            contextTokenBudget: defaultContextTokenBudget,
            config: normalizeOpenRouterConfig(defaultConfig ?? defaultOpenRouterConfig),
            createdAt: now,
            updatedAt: now,
        };
    }

    if (provider === "google-ai") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            contextTokenBudget: defaultContextTokenBudget,
            config: normalizeGoogleAIConfig(defaultConfig ?? defaultGoogleAIConfig),
            createdAt: now,
            updatedAt: now,
        };
    }

    if (provider === "anthropic") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            contextTokenBudget: defaultContextTokenBudget,
            config: normalizeAnthropicConfig(defaultConfig ?? defaultAnthropicConfig),
            createdAt: now,
            updatedAt: now,
        };
    }

    if (provider === "novelai") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            contextTokenBudget: defaultContextTokenBudget,
            config: normalizeNovelAIConfig(defaultConfig ?? defaultNovelAIConfig),
            createdAt: now,
            updatedAt: now,
        };
    }

    if (provider !== "openai-compatible") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            contextTokenBudget: defaultContextTokenBudget,
            config: defaultConfig ?? {},
            createdAt: now,
            updatedAt: now,
        };
    }

    return {
        id: createConnectionProfileId(),
        name,
        provider,
        contextTokenBudget: defaultContextTokenBudget,
        config: normalizeOpenAICompatibleConfig(
            defaultConfig ?? defaultOpenAICompatibleConfig,
        ),
        createdAt: now,
        updatedAt: now,
    };
}

export function getActiveConnectionProfile(settings: ConnectionSettings) {
    return (
        settings.profiles.find((profile) => profile.id === settings.activeProfileId) ??
        settings.profiles[0]
    );
}

export function isOpenAICompatibleProfile(
    profile: ConnectionProfile | undefined,
): profile is OpenAICompatibleConnectionProfile {
    return profile?.provider === "openai-compatible";
}

export function isOpenRouterProfile(
    profile: ConnectionProfile | undefined,
): profile is OpenRouterConnectionProfile {
    return profile?.provider === "openrouter";
}

export function isGoogleAIProfile(
    profile: ConnectionProfile | undefined,
): profile is GoogleAIConnectionProfile {
    return profile?.provider === "google-ai";
}

export function isAnthropicProfile(
    profile: ConnectionProfile | undefined,
): profile is AnthropicConnectionProfile {
    return profile?.provider === "anthropic";
}

export function isNovelAIProfile(
    profile: ConnectionProfile | undefined,
): profile is NovelAIConnectionProfile {
    return profile?.provider === "novelai";
}

function normalizeProfileSettings(settings: Record<string, unknown>): ConnectionSettings {
    const sourceProfiles = Array.isArray(settings.profiles) ? settings.profiles : [];
    const profiles = sourceProfiles
        .map(normalizeConnectionProfile)
        .filter((profile): profile is ConnectionProfile => Boolean(profile));

    if (profiles.length === 0) {
        return defaultConnectionSettings;
    }

    const activeProfileId =
        typeof settings.activeProfileId === "string" &&
        profiles.some((profile) => profile.id === settings.activeProfileId)
            ? settings.activeProfileId
            : profiles[0].id;

    return {
        version: 1,
        activeProfileId,
        profiles,
    };
}

function normalizeConnectionProfile(value: unknown): ConnectionProfile | undefined {
    const profile = isRecord(value) ? value : {};
    const provider = normalizeProvider(profile.provider);

    if (!provider) {
        return undefined;
    }

    const now = new Date().toISOString();

    return {
        id: stringOrFallback(profile.id, createConnectionProfileId()),
        name: stringOrFallback(profile.name, "Untitled connection"),
        provider,
        contextTokenBudget: normalizeContextTokenBudget(profile.contextTokenBudget),
        config:
            provider === "openai-compatible"
                ? normalizeOpenAICompatibleConfig(profile.config)
                : provider === "openrouter"
                  ? normalizeOpenRouterConfig(profile.config)
                  : provider === "google-ai"
                    ? normalizeGoogleAIConfig(profile.config)
                    : provider === "anthropic"
                      ? normalizeAnthropicConfig(profile.config)
                      : provider === "novelai"
                        ? normalizeNovelAIConfig(profile.config)
                        : normalizePluginConfig(profile.config),
        createdAt: stringOrFallback(profile.createdAt, now),
        updatedAt: stringOrFallback(profile.updatedAt, now),
    } as ConnectionProfile;
}

function migrateLegacySettings(settings: Record<string, unknown>): ConnectionSettings {
    const providers = isRecord(settings.providers) ? settings.providers : {};
    const openAIConfig = isRecord(providers["openai-compatible"])
        ? providers["openai-compatible"]
        : {};
    const profile = {
        ...defaultConnectionSettings.profiles[0],
        config: normalizeOpenAICompatibleConfig(openAIConfig),
    };

    return {
        version: 1,
        activeProfileId: profile.id,
        profiles: [profile],
    };
}

function migrateLegacySecrets(secrets: Record<string, unknown>): ConnectionSecrets {
    const providers = isRecord(secrets.providers) ? secrets.providers : {};
    const openAISecrets = isRecord(providers["openai-compatible"])
        ? providers["openai-compatible"]
        : {};
    const apiKey = stringOrUndefined(openAISecrets.apiKey);

    return {
        version: 1,
        profiles: {
            [migratedOpenAIProfileId]: apiKey ? { apiKey } : {},
        },
    };
}

function normalizeProvider(value: unknown): ConnectionProviderId | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizePluginConfig(value: unknown): Record<string, unknown> {
    return isRecord(value) ? { ...value, apiKey: stringOrUndefined(value.apiKey) } : {};
}

function createConnectionProfileId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `profile-${crypto.randomUUID()}`;
    }

    return `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stringOrFallback(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value : fallback;
}
