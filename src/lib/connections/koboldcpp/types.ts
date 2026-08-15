import type { InstructTemplateId } from "../../instruct";

export type KoboldCPPConnectionConfig = {
    apiKey?: string;
    baseUrl: string;
    maxOutputTokens?: number;
    maxContextLength?: number;
    model: { source: "loaded" | "custom"; id: string };
    instructTemplate: InstructTemplateId;
};

export type KoboldCPPRuntimeConfig = KoboldCPPConnectionConfig & {
    /** Profile-level prompt budget, supplied at runtime rather than persisted in provider config. */
    contextTokenBudget?: number;
};

export type KoboldCPPGenerateResponse = { results?: Array<{ text?: string }> };
export type KoboldCPPStreamChunk = { token?: string; text?: string; error?: string };
