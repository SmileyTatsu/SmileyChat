import { isRecord } from "../../common/guards";
import { stringOrUndefined } from "../config-utils";
import { defaultOutputTokenLimit, normalizeOutputTokenLimit } from "../output-tokens";
import type { KoboldCPPConnectionConfig } from "./types";

export const defaultKoboldCPPConfig: KoboldCPPConnectionConfig = {
    baseUrl: "http://localhost:5001/api",
    maxOutputTokens: defaultOutputTokenLimit,
    model: { source: "loaded", id: "" },
};

export function normalizeKoboldCPPConfig(value: unknown): KoboldCPPConnectionConfig {
    const config = isRecord(value) ? value : {};
    const model = isRecord(config.model) ? config.model : {};
    const maxContextLength =
        typeof config.maxContextLength === "number" &&
        Number.isFinite(config.maxContextLength) &&
        config.maxContextLength > 0
            ? Math.floor(config.maxContextLength)
            : undefined;
    return {
        apiKey: stringOrUndefined(config.apiKey),
        baseUrl: stringOrUndefined(config.baseUrl) ?? defaultKoboldCPPConfig.baseUrl,
        maxOutputTokens: normalizeOutputTokenLimit(config.maxOutputTokens, 1),
        ...(maxContextLength ? { maxContextLength } : {}),
        model: {
            source: model.source === "custom" ? "custom" : "loaded",
            id: stringOrUndefined(model.id) ?? "",
        },
    };
}
