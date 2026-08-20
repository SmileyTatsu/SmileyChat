import defaultAnthropicModels from "#frontend/data/default-anthropic-models.json";
import defaultGoogleAIModels from "#frontend/data/default-google-ai-models.json";
import defaultNovelAIModels from "#frontend/data/default-novelai-models.json";
import defaultOpenAIModels from "#frontend/data/default-openai-models.json";
import defaultXAIModels from "#frontend/data/default-xai-models.json";

import type { PresetGenerationSettings } from "../presets/types";
import type { ConnectionProfile } from "./config";
import { defaultOutputTokenLimit } from "./output-tokens";
import type { ChatGenerationRequest } from "./types";

type ValidationParameter = {
    supported: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
};

type RequestValidation = {
    inputTokenLimit?: number;
    maxOutputTokens?: number | null;
    [parameter: string]: unknown;
};

type CatalogModel = { id: string; requestValidation?: RequestValidation };
type CatalogCategory = { models?: CatalogModel[] };
type Catalog = CatalogCategory | CatalogCategory[];

export type RequestValidationChange = {
    field: string;
    requested: unknown;
    applied: unknown;
    reason: "unsupported" | "minimum" | "maximum" | "integer";
};

export type PreparedGenerationRequest = {
    changes: RequestValidationChange[];
    inputTokenLimit?: number;
    metadataSource: "catalog" | "openrouter" | "none";
    profile: ConnectionProfile;
    request: ChatGenerationRequest;
};

const catalogs: Partial<Record<ConnectionProfile["provider"], Catalog>> = {
    "openai-compatible": defaultOpenAIModels,
    "google-ai": defaultGoogleAIModels,
    anthropic: defaultAnthropicModels,
    novelai: defaultNovelAIModels,
    xai: defaultXAIModels,
};

const parameterFields: Array<[keyof PresetGenerationSettings, string]> = [
    ["temperature", "temperature"],
    ["topP", "topP"],
    ["topK", "topK"],
    ["minP", "minP"],
    ["topA", "topA"],
    ["presencePenalty", "presencePenalty"],
    ["frequencyPenalty", "frequencyPenalty"],
    ["typicalP", "typicalP"],
    ["tfs", "tailFreeSampling"],
    ["repetitionPenalty", "repetitionPenalty"],
    ["seed", "seed"],
    ["stopSequences", "stopSequences"],
];

const openRouterParameterFields: Record<string, keyof PresetGenerationSettings> = {
    temperature: "temperature",
    top_p: "topP",
    top_k: "topK",
    min_p: "minP",
    top_a: "topA",
    presence_penalty: "presencePenalty",
    frequency_penalty: "frequencyPenalty",
    repetition_penalty: "repetitionPenalty",
    seed: "seed",
    stop: "stopSequences",
};

/** Flattens both category-array catalogs and NovelAI's legacy root category. */
export function flattenCatalogModels(catalog: Catalog): CatalogModel[] {
    const categories = Array.isArray(catalog) ? catalog : [catalog];
    return categories.flatMap((category) => category.models ?? []);
}

export function getRequestValidation(profile: ConnectionProfile | undefined): {
    metadata?: RequestValidation;
    source: PreparedGenerationRequest["metadataSource"];
} {
    if (!profile) return { source: "none" };
    const config = profile.config as { model?: { id?: unknown; source?: unknown } };
    const model = config.model;
    const modelId = typeof model?.id === "string" ? model.id : "";

    if (profile.provider === "openrouter" && model?.source === "api") {
        const supported = (model as { supportedParameters?: unknown })
            .supportedParameters;
        if (Array.isArray(supported) && supported.length) {
            return {
                source: "openrouter",
                metadata: openRouterValidation(supported),
            };
        }
    }

    // Catalog validation is intentionally opt-in for the checked-in selection.
    // API-loaded and custom models can share an ID but may expose different limits.
    if (model?.source !== "default" || !modelId) return { source: "none" };
    const catalog = catalogs[profile.provider];
    const metadata = catalog
        ? flattenCatalogModels(catalog).find((candidate) => candidate.id === modelId)
              ?.requestValidation
        : undefined;
    return metadata ? { metadata, source: "catalog" } : { source: "none" };
}

export function getRequestInputTokenLimit(profile: ConnectionProfile | undefined) {
    const limit = getRequestValidation(profile).metadata?.inputTokenLimit;
    return typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;
}

export function getEffectiveOutputTokenLimit(profile: ConnectionProfile | undefined) {
    if (!profile) return undefined;
    const key = outputTokenKey(profile.provider);
    const configured = key ? (profile.config as Record<string, unknown>)[key] : undefined;
    const hasConfiguredValue =
        typeof configured === "number" && Number.isFinite(configured);
    const cap = getRequestValidation(profile).metadata?.maxOutputTokens;
    return typeof cap === "number" && Number.isFinite(cap) && cap > 0
        ? Math.min(hasConfiguredValue ? configured : defaultOutputTokenLimit, cap)
        : hasConfiguredValue
          ? configured
          : undefined;
}

export function prepareGenerationRequest(
    profile: ConnectionProfile,
    request: ChatGenerationRequest,
): PreparedGenerationRequest {
    const { metadata, source } = getRequestValidation(profile);
    const changes: RequestValidationChange[] = [];
    const normalizedProfile = normalizeOutputLimit(profile, metadata, changes);
    const generation = normalizeGeneration(request.generation, metadata, changes);
    const inputTokenLimit = getRequestInputTokenLimit(profile);

    return {
        changes,
        ...(inputTokenLimit ? { inputTokenLimit } : {}),
        metadataSource: source,
        profile: normalizedProfile,
        request: generation === request.generation ? request : { ...request, generation },
    };
}

function normalizeOutputLimit(
    profile: ConnectionProfile,
    metadata: RequestValidation | undefined,
    changes: RequestValidationChange[],
) {
    const cap = metadata?.maxOutputTokens;
    if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) return profile;

    const config = profile.config as Record<string, unknown>;
    const key = outputTokenKey(profile.provider);
    const current = key ? config[key] : undefined;
    const effectiveCurrent =
        typeof current === "number" && Number.isFinite(current)
            ? current
            : defaultOutputTokenLimit;
    if (effectiveCurrent <= cap) return profile;

    changes.push({ field: key!, requested: current, applied: cap, reason: "maximum" });
    return { ...profile, config: { ...config, [key!]: cap } } as ConnectionProfile;
}

function outputTokenKey(provider: ConnectionProfile["provider"]) {
    if (provider === "anthropic") return "maxTokens";
    if (provider === "google-ai" || provider === "novelai" || provider === "koboldcpp")
        return "maxOutputTokens";
    if (
        provider === "openai-compatible" ||
        provider === "openrouter" ||
        provider === "xai"
    )
        return "maxCompletionTokens";
    return undefined;
}

function normalizeGeneration(
    generation: PresetGenerationSettings | undefined,
    metadata: RequestValidation | undefined,
    changes: RequestValidationChange[],
) {
    if (!generation || !metadata) return generation;
    let output: PresetGenerationSettings | undefined;
    for (const [field, metadataField] of parameterFields) {
        const requested = generation[field];
        const parameter = asParameter(metadata[metadataField]);
        if (requested === undefined || !parameter) continue;
        if (!parameter.supported) {
            output ??= { ...generation };
            delete output[field];
            changes.push({ field, requested, applied: undefined, reason: "unsupported" });
            continue;
        }
        if (typeof requested !== "number" || !Number.isFinite(requested)) continue;
        let applied = requested;
        let reason: RequestValidationChange["reason"] | undefined;
        if (parameter.integer && !Number.isInteger(applied)) {
            applied = Math.round(applied);
            reason = "integer";
        }
        if (typeof parameter.min === "number" && applied < parameter.min) {
            applied = parameter.min;
            reason = "minimum";
        }
        if (typeof parameter.max === "number" && applied > parameter.max) {
            applied = parameter.max;
            reason = "maximum";
        }
        if (applied !== requested) {
            output ??= { ...generation };
            output[field] = applied as never;
            changes.push({ field, requested, applied, reason: reason! });
        }
    }
    return output ?? generation;
}

function asParameter(value: unknown): ValidationParameter | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const parameter = value as Record<string, unknown>;
    if (typeof parameter.supported !== "boolean") return undefined;
    return {
        supported: parameter.supported,
        ...(typeof parameter.min === "number" ? { min: parameter.min } : {}),
        ...(typeof parameter.max === "number" ? { max: parameter.max } : {}),
        ...(parameter.integer === true ? { integer: true } : {}),
    };
}

function openRouterValidation(parameters: unknown[]): RequestValidation {
    const supported = new Set(
        parameters.filter((value): value is string => typeof value === "string"),
    );
    return Object.fromEntries(
        Object.entries(openRouterParameterFields).map(([name, field]) => [
            field,
            { supported: supported.has(name) },
        ]),
    ) as RequestValidation;
}
