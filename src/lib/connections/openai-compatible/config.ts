import defaultOpenAIModels from "#frontend/data/default-openai-models.json";

import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";

import type {
    OpenAICompatibleConnectionConfig,
    OpenAICompatibleModel,
    OpenAICompatibleReasoningConfig,
} from "./types";

export const defaultOpenAICompatibleConfig: OpenAICompatibleConnectionConfig = {
    baseUrl: "https://api.openai.com/v1",
    maxCompletionTokens: defaultOutputTokenLimit,
    model: {
        source: "default",
        id: defaultOpenAIModels[0]?.models[0]?.id ?? "",
    },
};

export function normalizeOpenAICompatibleConfig(
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
        cachedModels: normalizeCachedModels(config.cachedModels),
        maxCompletionTokens: normalizeOutputTokenLimit(config.maxCompletionTokens, 16),
        model: {
            source: modelSource,
            id:
                typeof model.id === "string"
                    ? model.id
                    : defaultOpenAICompatibleConfig.model.id,
        },
        reasoning: normalizeOpenAICompatibleReasoningConfig(config.reasoning),
    };
}

function normalizeCachedModels(value: unknown): OpenAICompatibleModel[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const models = value.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string") {
            return [];
        }

        return [
            {
                id: item.id,
                object: "model" as const,
                created: typeof item.created === "number" ? item.created : 0,
                owned_by: typeof item.owned_by === "string" ? item.owned_by : "",
            },
        ];
    });

    return models.length > 0 ? models : undefined;
}

function normalizeOpenAICompatibleReasoningConfig(
    value: unknown,
): OpenAICompatibleReasoningConfig | undefined {
    const reasoning = isRecord(value) ? value : {};

    if (reasoning.enabled !== true) {
        return undefined;
    }

    const effort = normalizeOpenAICompatibleReasoningEffort(reasoning.effort);

    if (!effort) {
        return undefined;
    }

    return {
        enabled: true,
        effort,
        wireFormat:
            reasoning.wireFormat === "chat-reasoning-object"
                ? "chat-reasoning-object"
                : "chat-reasoning-effort",
    };
}

function normalizeOpenAICompatibleReasoningEffort(
    value: unknown,
): OpenAICompatibleReasoningConfig["effort"] | undefined {
    return value === "xhigh" ||
        value === "high" ||
        value === "medium" ||
        value === "low" ||
        value === "minimal" ||
        value === "none"
        ? value
        : undefined;
}
