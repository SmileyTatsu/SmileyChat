import defaultOpenAIModels from "../../data/defaultOpenAIModels.json";
import { isRecord } from "../common/guards";
import type { OpenAICompatibleConnectionConfig } from "./openai-compatible/types";

export type ConnectionProviderId = "openai-compatible" | (string & {});

export type OpenAICompatibleConnectionProfile = {
    id: string;
    name: string;
    provider: "openai-compatible";
    config: OpenAICompatibleConnectionConfig;
    createdAt: string;
    updatedAt: string;
};

export type PluginConnectionProfile = {
    id: string;
    name: string;
    provider: Exclude<ConnectionProviderId, "openai-compatible">;
    config: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type ConnectionProfile =
    | OpenAICompatibleConnectionProfile
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

export const defaultOpenAICompatibleConfig: OpenAICompatibleConnectionConfig = {
    baseUrl: "https://api.openai.com/v1",
    model: {
        source: "default",
        id: defaultOpenAIModels[0]?.models[0]?.id ?? "",
    },
};

export const defaultConnectionSettings: ConnectionSettings = {
    version: 1,
    activeProfileId: migratedOpenAIProfileId,
    profiles: [
        {
            id: migratedOpenAIProfileId,
            name: "OpenAI",
            provider: "openai-compatible",
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

    if (provider !== "openai-compatible") {
        return {
            id: createConnectionProfileId(),
            name,
            provider,
            config: defaultConfig ?? {},
            createdAt: now,
            updatedAt: now,
        };
    }

    return {
        id: createConnectionProfileId(),
        name,
        provider,
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
        config:
            provider === "openai-compatible"
                ? normalizeOpenAICompatibleConfig(profile.config)
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

function normalizeOpenAICompatibleConfig(
    value: unknown,
): OpenAICompatibleConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const modelSource =
        model.source === "api" || model.source === "custom" ? model.source : "default";

    return {
        baseUrl:
            typeof config.baseUrl === "string" && config.baseUrl.trim()
                ? config.baseUrl
                : defaultOpenAICompatibleConfig.baseUrl,
        apiKey: stringOrUndefined(config.apiKey),
        model: {
            source: modelSource,
            id:
                typeof model.id === "string"
                    ? model.id
                    : defaultOpenAICompatibleConfig.model.id,
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

function stringOrUndefined(value: unknown) {
    return typeof value === "string" && value.trim() ? value : undefined;
}
