import { createId } from "#frontend/lib/common/ids";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

/** Reserved for future ordering around other text-transforming extensions. */
export type RegexPass = "early" | "late";
export type RegexDestination = "save" | "display" | "prompt";
export type RegexTargets = {
    userInput: boolean;
    aiResponse: boolean;
    slashCommand: boolean;
    worldInfo: boolean;
    reasoning: boolean;
};

export type RegexRule = {
    id: string;
    enabled: boolean;
    pattern: string;
    flags: string;
    replacement: string;
    description: string;
    trimOut: string;
    destination: RegexDestination;
    minDepth: number;
    maxDepth: number;
    targets: RegexTargets;
};

export type RegexProfile = {
    id: string;
    name: string;
    rules: RegexRule[];
};

export type RegexSettings = {
    enabled: boolean;
    activeProfileId: string;
    profiles: RegexProfile[];
};

let settingsCache = defaultRegexSettings();

export function defaultRegexSettings(): RegexSettings {
    const defaultProfileId = createId("regex-profile");
    return {
        enabled: false,
        activeProfileId: defaultProfileId,
        profiles: [{ id: defaultProfileId, name: "Default", rules: [] }],
    };
}

export function createRegexRule(): RegexRule {
    return {
        id: createId("regex-rule"),
        enabled: true,
        pattern: "",
        flags: "g",
        replacement: "",
        description: "New rule",
        trimOut: "",
        destination: "save",
        minDepth: 0,
        maxDepth: -1,
        targets: defaultRegexTargets(),
    };
}

export function createRegexProfile(name: string): RegexProfile {
    return {
        id: createId("regex-profile"),
        name,
        rules: [],
    };
}

export async function activate(api: SmileyPluginApi) {
    settingsCache = normalizeRegexSettings(
        await api.storage.getJson("settings", settingsCache).catch(() => settingsCache),
    );
}

export function getRegexSettings() {
    return settingsCache;
}

export async function saveRegexSettings(api: SmileyPluginApi, value: RegexSettings) {
    settingsCache = normalizeRegexSettings(value);
    await api.storage.setJson("settings", settingsCache);
    return settingsCache;
}

export function normalizeRegexSettings(value: unknown): RegexSettings {
    const source = isRecord(value) ? value : {};

    let profiles = Array.isArray(source.profiles)
        ? source.profiles
              .map(normalizeRegexProfile)
              .filter((p): p is RegexProfile => p !== undefined)
        : [];

    // Migration from old single-profile format (if rules exist at top level)
    if (profiles.length === 0 && Array.isArray(source.rules)) {
        const legacyRules = source.rules
            .map(normalizeRegexRule)
            .filter((rule): rule is RegexRule => rule !== undefined);

        if (legacyRules.length > 0) {
            profiles = [
                {
                    id: createId("regex-profile"),
                    name: "Legacy Profile",
                    rules: legacyRules,
                },
            ];
        }
    }

    if (profiles.length === 0) {
        profiles = [defaultRegexSettings().profiles[0]];
    }

    const activeProfileId =
        stringValue(source.activeProfileId) &&
        profiles.some((p) => p.id === source.activeProfileId)
            ? stringValue(source.activeProfileId)
            : profiles[0].id;

    return {
        enabled: booleanValue(source.enabled, false),
        activeProfileId,
        profiles,
    };
}

function normalizeRegexProfile(value: unknown): RegexProfile | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return {
        id: stringValue(value.id) || createId("regex-profile"),
        name: stringValue(value.name) || "Unnamed Profile",
        rules: Array.isArray(value.rules)
            ? value.rules
                  .map(normalizeRegexRule)
                  .filter((rule): rule is RegexRule => rule !== undefined)
            : [],
    };
}

function normalizeRegexRule(value: unknown): RegexRule | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const pattern = stringValue(value.pattern);
    const replacement = stringValue(value.replacement);

    return {
        id: stringValue(value.id) || createId("regex-rule"),
        enabled: booleanValue(value.enabled, true),
        pattern,
        flags: stringValue(value.flags) || "g",
        replacement,
        description: stringValue(value.description),
        trimOut: stringValue(value.trimOut),
        destination: destinationValue(value.destination),
        minDepth: integerValue(value.minDepth, 0, 100000, 0),
        maxDepth: integerValue(value.maxDepth, -1, 100000, -1),
        targets: normalizeTargets(value.targets),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function defaultRegexTargets(): RegexTargets {
    return {
        userInput: false,
        aiResponse: true,
        slashCommand: false,
        worldInfo: false,
        reasoning: false,
    };
}

function normalizeTargets(value: unknown): RegexTargets {
    const source = isRecord(value) ? value : {};
    const fallback = defaultRegexTargets();
    return {
        userInput: booleanValue(source.userInput, fallback.userInput),
        aiResponse: booleanValue(source.aiResponse, fallback.aiResponse),
        slashCommand: booleanValue(source.slashCommand, fallback.slashCommand),
        worldInfo: booleanValue(source.worldInfo, fallback.worldInfo),
        reasoning: booleanValue(source.reasoning, fallback.reasoning),
    };
}

function destinationValue(value: unknown): RegexDestination {
    return value === "display" || value === "prompt" || value === "save" ? value : "save";
}

function integerValue(value: unknown, min: number, max: number, fallback: number) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, Math.floor(value)))
        : fallback;
}
