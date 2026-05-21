import { isRecord } from "../../common/guards";
import { normalizeStringList, stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";

import type {
    OpenRouterConnectionConfig,
    OpenRouterProviderPreferences,
    OpenRouterReasoningConfig,
    OpenRouterSort,
} from "./types";

export const defaultOpenRouterConfig: OpenRouterConnectionConfig = {
    maxCompletionTokens: defaultOutputTokenLimit,
    model: {
        source: "api",
        id: "",
    },
    providerPreferences: {
        allow_fallbacks: true,
        data_collection: "allow",
    },
};

export function normalizeOpenRouterConfig(value: unknown): OpenRouterConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};

    return {
        apiKey: stringOrUndefined(config.apiKey),
        maxCompletionTokens: normalizeOutputTokenLimit(config.maxCompletionTokens, 16),
        model: {
            source: "api",
            id: typeof model.id === "string" ? model.id : "",
            supportedParameters: normalizeStringList(model.supportedParameters),
        },
        providerPreferences: normalizeOpenRouterProviderPreferences(
            config.providerPreferences,
        ),
        reasoning: normalizeOpenRouterReasoningConfig(config.reasoning),
    };
}

function normalizeOpenRouterReasoningConfig(
    value: unknown,
): OpenRouterReasoningConfig | undefined {
    const reasoning = isRecord(value) ? value : {};
    const effort = normalizeOpenRouterReasoningEffort(reasoning.effort);
    const maxTokens =
        typeof reasoning.max_tokens === "number" &&
        Number.isInteger(reasoning.max_tokens) &&
        reasoning.max_tokens > 0
            ? reasoning.max_tokens
            : undefined;
    const exclude =
        typeof reasoning.exclude === "boolean" ? reasoning.exclude : undefined;

    if (!effort && !maxTokens && exclude === undefined) {
        return undefined;
    }

    return {
        ...(effort ? { effort } : {}),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(exclude !== undefined ? { exclude } : {}),
    };
}

function normalizeOpenRouterProviderPreferences(
    value: unknown,
): OpenRouterProviderPreferences {
    const preferences = isRecord(value) ? value : {};
    const sort = normalizeOpenRouterSort(preferences.sort);
    const dataCollection = preferences.data_collection === "deny" ? "deny" : "allow";

    return {
        ...(sort ? { sort } : {}),
        allow_fallbacks:
            typeof preferences.allow_fallbacks === "boolean"
                ? preferences.allow_fallbacks
                : true,
        require_parameters:
            typeof preferences.require_parameters === "boolean"
                ? preferences.require_parameters
                : false,
        data_collection: dataCollection,
        zdr: typeof preferences.zdr === "boolean" ? preferences.zdr : false,
        order: normalizeStringList(preferences.order),
        only: normalizeStringList(preferences.only),
        ignore: normalizeStringList(preferences.ignore),
    };
}

function normalizeOpenRouterSort(value: unknown): OpenRouterSort | undefined {
    return value === "price" || value === "throughput" || value === "latency"
        ? value
        : undefined;
}

function normalizeOpenRouterReasoningEffort(
    value: unknown,
): OpenRouterReasoningConfig["effort"] | undefined {
    return value === "xhigh" ||
        value === "high" ||
        value === "medium" ||
        value === "low" ||
        value === "minimal" ||
        value === "none"
        ? value
        : undefined;
}
