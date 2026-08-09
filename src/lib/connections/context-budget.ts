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

type LocalModel = {
    id: string;
    contextTokenLimit?: number;
};

type LocalModelCategory = {
    models: LocalModel[];
};

export type EffectiveContextTokenBudget = {
    source: "custom" | "local-model" | "fallback";
    tokenBudget: number;
    totalTokenLimit: number;
    reservedOutputTokens: number;
};

const localCatalogs: Partial<
    Record<ConnectionProfile["provider"], LocalModelCategory[]>
> = {
    "openai-compatible": defaultOpenAIModels,
    "google-ai": defaultGoogleAIModels,
    anthropic: defaultAnthropicModels,
    novelai: defaultNovelAIModels,
    xai: defaultXAIModels,
};

export function getModelMaxContextLimit(profile: ConnectionProfile | undefined): number {
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

    if (profile?.overrideModelContext) {
        const reservedOutputTokens = getReservedOutputTokens(profile);
        return {
            source: "custom",
            totalTokenLimit: rawBudget,
            reservedOutputTokens,
            tokenBudget: Math.max(0, rawBudget - reservedOutputTokens),
        };
    }

    const modelMax = getModelMaxContextLimit(profile);
    const tokenBudget = Math.min(modelMax, rawBudget);
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
        config.maxCompletionTokens ?? config.maxOutputTokens ?? config.maxTokens;
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
    const value = categories
        ?.flatMap((category) => category.models)
        .find((model) => model.id === modelId)?.contextTokenLimit;

    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.round(value)
        : undefined;
}
