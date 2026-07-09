import defaultXAIModels from "#frontend/data/default-xai-models.json";

import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";

import type { XAIConnectionConfig, XAIReasoningConfig } from "./types";

export const defaultXAIConfig: XAIConnectionConfig = {
    baseUrl: "https://api.x.ai/v1",
    maxCompletionTokens: defaultOutputTokenLimit,
    model: {
        source: "default",
        id: defaultXAIModels[0]?.models[0]?.id ?? "grok-4.5",
    },
};

export function normalizeXAIConfig(value: unknown): XAIConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const modelSource =
        model.source === "api" || model.source === "custom" ? model.source : "default";
    const reasoning = normalizeXAIReasoningConfig(config.reasoning);

    return {
        baseUrl:
            typeof config.baseUrl === "string" && config.baseUrl.trim()
                ? config.baseUrl
                : defaultXAIConfig.baseUrl,
        apiKey: stringOrUndefined(config.apiKey),
        maxCompletionTokens: normalizeOutputTokenLimit(config.maxCompletionTokens, 16),
        model: {
            source: modelSource,
            id: typeof model.id === "string" ? model.id : defaultXAIConfig.model.id,
        },
        ...(reasoning ? { reasoning } : {}),
    };
}

function normalizeXAIReasoningConfig(value: unknown): XAIReasoningConfig | undefined {
    const reasoning = isRecord(value) ? value : {};

    if (reasoning.enabled !== true) {
        return undefined;
    }

    const effort = normalizeXAIReasoningEffort(reasoning.effort);

    return {
        enabled: true,
        ...(effort ? { effort } : {}),
    };
}

function normalizeXAIReasoningEffort(
    value: unknown,
): Extract<XAIReasoningConfig, { enabled: true }>["effort"] | undefined {
    return value === "low" || value === "medium" || value === "high" ? value : undefined;
}
