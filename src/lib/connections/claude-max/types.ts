export type ClaudeMaxThinkingMode = "off" | "adaptive";

export type ClaudeMaxModelSelection = {
    source: "default" | "custom";
    id: string;
};

export type ClaudeMaxConnectionConfig = {
    model: ClaudeMaxModelSelection;
    thinking: ClaudeMaxThinkingMode;
    contextWindow: number;
    maxOutputTokens: number;
};

export type ClaudeMaxRuntimeConfig = ClaudeMaxConnectionConfig;

export type ClaudeMaxModel = {
    id: string;
    label: string;
    context: number;
    maxOutput: number;
};
