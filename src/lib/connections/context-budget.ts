import defaultAnthropicModels from "#frontend/data/default-anthropic-models.json";
import defaultGoogleAIModels from "#frontend/data/default-google-ai-models.json";
import defaultNovelAIModels from "#frontend/data/default-novelai-models.json";
import defaultOpenAIModels from "#frontend/data/default-openai-models.json";
import defaultXAIModels from "#frontend/data/default-xai-models.json";
import {
    maxContextTokenBudget,
    normalizeContextTokenBudget,
} from "#frontend/lib/presets/context-budget-constants";

import type { ConnectionProfile } from "./config";
import {
    getEffectiveOutputTokenLimit,
    getRequestInputTokenLimit,
} from "./request-validation";
import { flattenCatalogModels } from "./request-validation";

type LocalModel = {
    id: string;
    contextTokenLimit?: number;
};

export type EffectiveContextTokenBudget = {
    source: "custom" | "local-model" | "fallback";
    tokenBudget: number;
    totalTokenLimit: number;
    reservedOutputTokens: number;
};

const localCatalogs: Partial<Record<ConnectionProfile["provider"], LocalModel[]>> = {
    "openai-compatible": flattenCatalogModels(defaultOpenAIModels),
    "google-ai": flattenCatalogModels(defaultGoogleAIModels),
    anthropic: flattenCatalogModels(defaultAnthropicModels),
    novelai: flattenCatalogModels(defaultNovelAIModels),
    xai: flattenCatalogModels(defaultXAIModels),
};

export function getModelMaxContextLimit(profile: ConnectionProfile | undefined): number {
    if (profile?.provider === "koboldcpp") {
        const configured = (profile.config as { maxContextLength?: unknown })
            .maxContextLength;
        if (
            typeof configured === "number" &&
            Number.isFinite(configured) &&
            configured > 0
        ) {
            return Math.floor(configured);
        }
    }
    const model = getSelectedModel(profile);
    if (model?.source !== "custom" && model?.id) {
        const limit = getLocalModelContextTokenLimit(profile?.provider, model.id);
        if (limit !== undefined) {
            return limit;
        }
    }
    return maxContextTokenBudget;
}

/**
 * Uses only SmileyChat's checked-in model metadata. Provider model-list
 * responses intentionally never influence prompt trimming.
 */
export function getEffectiveContextTokenBudget(
    profile: ConnectionProfile | undefined,
): EffectiveContextTokenBudget {
    const rawBudget = normalizeContextTokenBudget(profile?.contextTokenBudget);
    const requestInputLimit = getRequestInputTokenLimit(profile);

    if (profile?.overrideModelContext) {
        const totalTokenLimit = Math.min(
            rawBudget,
            requestInputLimit ?? Number.POSITIVE_INFINITY,
        );
        const reservedOutputTokens = getReservedOutputTokens(profile);
        return {
            source: "custom",
            totalTokenLimit,
            reservedOutputTokens,
            tokenBudget: Math.max(0, totalTokenLimit - reservedOutputTokens),
        };
    }

    const modelMax = getModelMaxContextLimit(profile);
    const tokenBudget = Math.min(
        modelMax,
        rawBudget,
        requestInputLimit ?? Number.POSITIVE_INFINITY,
    );
    const reservedOutputTokens = getReservedOutputTokens(profile);

    const model = getSelectedModel(profile);
    const isLocalModel =
        model?.source !== "custom" &&
        model?.id !== undefined &&
        getLocalModelContextTokenLimit(profile?.provider, model.id) !== undefined;

    return {
        source: isLocalModel ? "local-model" : "fallback",
        totalTokenLimit: tokenBudget,
        reservedOutputTokens,
        tokenBudget: Math.max(0, tokenBudget - reservedOutputTokens),
    };
}

function getReservedOutputTokens(profile: ConnectionProfile | undefined) {
    if (!profile) return 0;
    const config = profile.config as Record<string, unknown>;
    const configured =
        getEffectiveOutputTokenLimit(profile) ??
        config.maxCompletionTokens ??
        config.maxOutputTokens ??
        config.maxTokens;
    const outputTokens =
        typeof configured === "number" && Number.isFinite(configured)
            ? Math.max(0, Math.floor(configured))
            : 1000;
    const thinking = config.thinking;
    const thinkingTokens =
        thinking &&
        typeof thinking === "object" &&
        "mode" in thinking &&
        thinking.mode === "enabled" &&
        "budgetTokens" in thinking &&
        typeof thinking.budgetTokens === "number"
            ? Math.max(0, Math.floor(thinking.budgetTokens))
            : 0;
    return outputTokens + thinkingTokens;
}

function getSelectedModel(profile: ConnectionProfile | undefined) {
    if (!profile || !("model" in profile.config)) {
        return undefined;
    }

    const model = profile.config.model;
    if (!model || typeof model !== "object" || !("id" in model) || !("source" in model)) {
        return undefined;
    }

    if (
        typeof model.id === "string" &&
        (model.source === "default" ||
            model.source === "api" ||
            model.source === "custom")
    ) {
        return { id: model.id, source: model.source };
    }

    return undefined;
}

export function getLocalModelContextTokenLimit(
    provider: ConnectionProfile["provider"] | undefined,
    modelId: string,
) {
    const categories = provider ? localCatalogs[provider] : undefined;
    const value = categories?.find((model) => model.id === modelId)?.contextTokenLimit;

    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.round(value)
        : undefined;
}
