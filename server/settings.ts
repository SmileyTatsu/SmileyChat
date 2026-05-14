import { existsSync } from "node:fs";
import { writeJsonAtomic } from "./http";
import {
    connectionSecretsPath,
    connectionSettingsPath,
    preferencesPath,
    presetsPath,
} from "./paths";
import {
    defaultConnectionSecrets,
    defaultConnectionSettings,
    extractConnectionSecrets,
    normalizeConnectionSettings,
    sanitizeConnectionSecrets,
    sanitizeConnectionSettings,
    type ConnectionSecrets,
    type ConnectionSettings,
} from "../src/lib/connections/config";
import { defaultPresetCollection } from "../src/lib/presets/defaults";
import { normalizePresetCollection } from "../src/lib/presets/normalize";
import type { PresetCollection } from "../src/lib/presets/types";
import {
    defaultAppPreferences,
    normalizeAppPreferences,
    type AppPreferences,
} from "../src/lib/preferences/types";

export async function readConnectionSettings(): Promise<ConnectionSettings> {
    if (!existsSync(connectionSettingsPath)) {
        await writeConnectionSettings(defaultConnectionSettings);
        return defaultConnectionSettings;
    }

    const file = Bun.file(connectionSettingsPath);
    return sanitizeConnectionSettings(await file.json());
}

export async function writeConnectionSettings(settings: unknown) {
    const safeSettings = sanitizeConnectionSettings(settings);
    await writeJsonAtomic(connectionSettingsPath, safeSettings);
    return safeSettings;
}

export async function readConnectionSecrets(): Promise<ConnectionSecrets> {
    const settingsSecrets = await readSecretsEmbeddedInConnectionSettings();

    if (!existsSync(connectionSecretsPath)) {
        await writeConnectionSecrets(settingsSecrets);
        return settingsSecrets;
    }

    const file = Bun.file(connectionSecretsPath);
    const savedSecrets = sanitizeConnectionSecrets(await file.json());
    const mergedSecrets = mergeConnectionSecrets(savedSecrets, settingsSecrets);

    if (JSON.stringify(mergedSecrets) !== JSON.stringify(savedSecrets)) {
        await writeConnectionSecrets(mergedSecrets);
    }

    return mergedSecrets;
}

export async function writeConnectionSecrets(secrets: unknown) {
    const safeSecrets = sanitizeConnectionSecrets(secrets);
    await writeJsonAtomic(connectionSecretsPath, safeSecrets);
    return safeSecrets;
}

async function readSecretsEmbeddedInConnectionSettings(): Promise<ConnectionSecrets> {
    if (!existsSync(connectionSettingsPath)) {
        return defaultConnectionSecrets;
    }

    try {
        return extractConnectionSecrets(
            normalizeConnectionSettings(await Bun.file(connectionSettingsPath).json()),
        );
    } catch {
        return defaultConnectionSecrets;
    }
}

function mergeConnectionSecrets(
    savedSecrets: ConnectionSecrets,
    settingsSecrets: ConnectionSecrets,
): ConnectionSecrets {
    const profiles = { ...settingsSecrets.profiles, ...savedSecrets.profiles };

    for (const [profileId, secret] of Object.entries(settingsSecrets.profiles)) {
        if (!savedSecrets.profiles[profileId]?.apiKey && secret.apiKey) {
            profiles[profileId] = secret;
        }
    }

    return {
        version: 1,
        profiles,
    };
}

export async function readPresetCollection(): Promise<PresetCollection> {
    if (!existsSync(presetsPath)) {
        await writePresetCollection(defaultPresetCollection);
        return defaultPresetCollection;
    }

    const file = Bun.file(presetsPath);
    return normalizePresetCollection(await file.json());
}

export async function writePresetCollection(presets: unknown) {
    const safePresets = normalizePresetCollection(presets);
    await writeJsonAtomic(presetsPath, safePresets);
    return safePresets;
}

export async function readAppPreferences(): Promise<AppPreferences> {
    if (!existsSync(preferencesPath)) {
        await writeAppPreferences(defaultAppPreferences);
        return defaultAppPreferences;
    }

    const file = Bun.file(preferencesPath);
    return normalizeAppPreferences(await file.json());
}

export async function writeAppPreferences(preferences: unknown) {
    const safePreferences = normalizeAppPreferences(preferences);
    await writeJsonAtomic(preferencesPath, safePreferences);
    return safePreferences;
}
