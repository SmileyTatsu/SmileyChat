import defaultAnthropicModels from "#frontend/data/default-anthropic-models.json";

import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";

import type { AnthropicConnectionConfig, AnthropicThinkingConfig } from "./types";

export const defaultAnthropicConfig: AnthropicConnectionConfig = {
    baseUrl: "https://api.anthropic.com/v1",
    model: {
        source: "default",
        id: defaultAnthropicModels[0]?.models[1]?.id ?? "claude-sonnet-4-6",
    },
    thinking: {
        mode: "off",
    },
};

export function normalizeAnthropicConfig(value: unknown): AnthropicConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const modelSource =
        model.source === "api" || model.source === "custom" ? model.source : "default";
    const thinking = normalizeAnthropicThinkingConfig(config.thinking);

    return {
        baseUrl:
            typeof config.baseUrl === "string" && config.baseUrl.trim()
                ? config.baseUrl
                : defaultAnthropicConfig.baseUrl,
        apiKey: stringOrUndefined(config.apiKey),
        model: {
            source: modelSource,
            id: typeof model.id === "string" ? model.id : defaultAnthropicConfig.model.id,
        },
        ...(thinking ? { thinking } : {}),
    };
}

function normalizeAnthropicThinkingConfig(
    value: unknown,
): AnthropicThinkingConfig | undefined {
    const thinking = isRecord(value) ? value : {};
    const mode = normalizeAnthropicThinkingMode(thinking.mode);

    if (mode === "adaptive") {
        const effort = normalizeAnthropicThinkingEffort(thinking.effort);
        const display = normalizeAnthropicThinkingDisplay(thinking.display);

        return {
            mode,
            ...(effort ? { effort } : {}),
            ...(display ? { display } : {}),
        };
    }

    if (mode === "enabled") {
        const budgetTokens =
            typeof thinking.budgetTokens === "number" &&
            Number.isInteger(thinking.budgetTokens) &&
            thinking.budgetTokens > 0
                ? thinking.budgetTokens
                : undefined;
        const display = normalizeAnthropicThinkingDisplay(thinking.display);

        return {
            mode,
            ...(budgetTokens ? { budgetTokens } : {}),
            ...(display ? { display } : {}),
        };
    }

    if (mode === "off") {
        return { mode };
    }

    return undefined;
}

function normalizeAnthropicThinkingMode(
    value: unknown,
): AnthropicThinkingConfig["mode"] | undefined {
    return value === "off" || value === "adaptive" || value === "enabled"
        ? value
        : undefined;
}

function normalizeAnthropicThinkingEffort(
    value: unknown,
): Extract<AnthropicThinkingConfig, { mode: "adaptive" }>["effort"] | undefined {
    return value === "medium" || value === "high" || value === "xhigh" || value === "max"
        ? value
        : undefined;
}

function normalizeAnthropicThinkingDisplay(
    value: unknown,
):
    | Extract<AnthropicThinkingConfig, { mode: "adaptive" | "enabled" }>["display"]
    | undefined {
    return value === "summarized" || value === "omitted" ? value : undefined;
}
