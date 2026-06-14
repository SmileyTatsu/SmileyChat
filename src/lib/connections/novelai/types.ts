export type NovelAIConnectionConfig = {
    apiKey?: string;
    baseUrl?: string;
    maxOutputTokens?: number;
    model: NovelAIModelSelection;
};

export type NovelAIRuntimeConfig = NovelAIConnectionConfig;

export type NovelAIModelSelection =
    | {
          source: "default";
          id: string;
      }
    | {
          source: "custom";
          id: string;
      };

export type NovelAIChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type NovelAIGenerationRequest = {
    frequency_penalty?: number;
    logit_bias?: Record<string, number>;
    max_tokens: number;
    messages: NovelAIChatMessage[];
    model: string;
    presence_penalty?: number;
    stop?: string[];
    stream?: boolean;
    temperature?: number;
    top_k?: number;
    top_p?: number;
    unified_cubic?: number;
    unified_increase_linear_with_entropy?: number;
    unified_linear?: number;
    unified_quadratic?: number;
};

export type NovelAICompletionResponse = {
    model?: string;
    choices?: Array<{
        message?: {
            content?: string | null;
        };
        error?: {
            message?: string;
        };
    }>;
};

export type NovelAIStreamChunk = {
    model?: string;
    error?: {
        message?: string;
    };
    choices?: Array<{
        delta?: {
            content?: string | null;
        };
    }>;
};
