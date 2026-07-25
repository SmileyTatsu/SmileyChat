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
    if (profile?.overrideModelContext) {
        return {
            source: "custom",
            tokenBudget: normalizeContextTokenBudget(profile.contextTokenBudget),
        };
    }

    const model = getSelectedModel(profile);
    if (model?.source !== "custom" && model?.id) {
        const contextTokenLimit = getLocalModelContextTokenLimit(
            profile?.provider,
            model.id,
        );
        if (contextTokenLimit !== undefined) {
            return { source: "local-model", tokenBudget: contextTokenLimit };
        }
    }

    return { source: "fallback", tokenBudget: maxContextTokenBudget };
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
