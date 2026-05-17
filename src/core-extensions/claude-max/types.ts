export type ClaudeMaxThinkingMode = "off" | "adaptive";

export type ClaudeMaxConfig = {
    model: {
        source: "default" | "custom";
        id: string;
    };
    thinking: ClaudeMaxThinkingMode;
    fastMode: boolean;
};

export type ClaudeMaxModel = {
    id: string;
    label: string;
    context: number;
    maxOutput: number;
};
