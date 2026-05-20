import defaultGoogleAIModels from "#frontend/data/default-google-ai-models.json";

import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";

import type { GoogleAIConnectionConfig, GoogleAIThinkingConfig } from "./types";

export const defaultGoogleAIConfig: GoogleAIConnectionConfig = {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    maxOutputTokens: defaultOutputTokenLimit,
    model: {
        source: "default",
        id: defaultGoogleAIModels[0]?.models[1]?.id ?? "gemini-3.1-flash-lite",
    },
};

export function normalizeGoogleAIConfig(value: unknown): GoogleAIConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const modelSource =
        model.source === "api" || model.source === "custom" ? model.source : "default";
    const thinking = normalizeGoogleAIThinkingConfig(config.thinking);

    return {
        baseUrl:
            typeof config.baseUrl === "string" && config.baseUrl.trim()
                ? config.baseUrl
                : defaultGoogleAIConfig.baseUrl,
        apiKey: stringOrUndefined(config.apiKey),
        maxOutputTokens: normalizeOutputTokenLimit(config.maxOutputTokens, 1),
        model: {
            source: modelSource,
            id: typeof model.id === "string" ? model.id : defaultGoogleAIConfig.model.id,
        },
        ...(thinking ? { thinking } : {}),
    };
}

function normalizeGoogleAIThinkingConfig(
    value: unknown,
): GoogleAIThinkingConfig | undefined {
    const thinking = isRecord(value) ? value : {};
    const includeThoughts =
        typeof thinking.includeThoughts === "boolean"
            ? thinking.includeThoughts
            : undefined;
    const mode = normalizeGoogleAIThinkingMode(thinking.mode);
    const thinkingLevel = normalizeGoogleAIThinkingLevel(thinking.thinkingLevel);
    const thinkingBudget = normalizeGoogleAIThinkingBudget(thinking.thinkingBudget);

    if (
        includeThoughts === undefined &&
        !mode &&
        !thinkingLevel &&
        thinkingBudget === undefined
    ) {
        return undefined;
    }

    return {
        ...(includeThoughts !== undefined ? { includeThoughts } : {}),
        ...(mode ? { mode } : {}),
        ...(thinkingLevel ? { thinkingLevel } : {}),
        ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    };
}

function normalizeGoogleAIThinkingMode(
    value: unknown,
): GoogleAIThinkingConfig["mode"] | undefined {
    return value === "level" || value === "budget" || value === "auto"
        ? value
        : undefined;
}

function normalizeGoogleAIThinkingLevel(
    value: unknown,
): GoogleAIThinkingConfig["thinkingLevel"] | undefined {
    return value === "minimal" ||
        value === "low" ||
        value === "medium" ||
        value === "high"
        ? value
        : undefined;
}

function normalizeGoogleAIThinkingBudget(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        return undefined;
    }

    return value === -1 || value >= 0 ? value : undefined;
}
