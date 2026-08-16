export type KoboldCPPConnectionConfig = {
    apiKey?: string;
    baseUrl: string;
    maxOutputTokens?: number;
    maxContextLength?: number;
    model: { source: "loaded" | "custom"; id: string };
};

export type KoboldCPPRuntimeConfig = KoboldCPPConnectionConfig & {
    /** Profile-level prompt budget, supplied at runtime rather than persisted in provider config. */
    contextTokenBudget?: number;
};

export type KoboldCPPGenerateResponse = { results?: Array<{ text?: string }> };
export type KoboldCPPStreamChunk = { token?: string; text?: string; error?: string };
