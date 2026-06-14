import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";

import { isDefaultNovelAIModel } from "./constants";
import type { NovelAIConnectionConfig } from "./types";

export const defaultNovelAIConfig: NovelAIConnectionConfig = {
    maxOutputTokens: defaultOutputTokenLimit,
    model: {
        source: "default",
        id: "llama-3-erato-v1",
    },
};

export function normalizeNovelAIConfig(value: unknown): NovelAIConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const modelId =
        typeof model.id === "string" && model.id.trim()
            ? model.id
            : defaultNovelAIConfig.model.id;
    const modelSource =
        model.source === "custom" || !isDefaultNovelAIModel(modelId)
            ? "custom"
            : "default";
    const baseUrl = stringOrUndefined(config.baseUrl);

    return {
        apiKey: stringOrUndefined(config.apiKey),
        ...(baseUrl ? { baseUrl } : {}),
        maxOutputTokens: normalizeOutputTokenLimit(config.maxOutputTokens, 1),
        model: {
            source: modelSource,
            id: modelId,
        },
    };
}
