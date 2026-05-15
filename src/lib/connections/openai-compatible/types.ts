export type OpenAICompatibleConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    model: OpenAICompatibleModelSelection;
    reasoning?: OpenAICompatibleReasoningConfig;
};

export type OpenAICompatibleRuntimeConfig = OpenAICompatibleConnectionConfig;

export type OpenAICompatibleModelSelection =
    | {
          source: "default";
          id: string;
      }
    | {
          source: "api";
          id: string;
      }
    | {
          source: "custom";
          id: string;
      };

export type OpenAICompatibleReasoningConfig = {
    enabled?: boolean;
    effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
    wireFormat?: "chat-reasoning-effort" | "chat-reasoning-object";
};

export type OpenAICompatibleChatMessage = {
    role: "developer" | "system" | "user" | "assistant";
    content: string;
    reasoning?: string;
    reasoning_details?: unknown;
};

export type OpenAICompatibleChatCompletionRequest = {
    model: string;
    messages: OpenAICompatibleChatMessage[];
    reasoning?: {
        effort?: OpenAICompatibleReasoningConfig["effort"];
    };
    reasoning_effort?: OpenAICompatibleReasoningConfig["effort"];
    stream?: boolean;
};

export type OpenAICompatibleChatCompletionResponse = {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: "assistant";
            content: string | null;
            reasoning?: string | null;
            reasoning_details?: unknown;
        };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
};

export type OpenAICompatibleModel = {
    id: string;
    object: "model";
    created: number;
    owned_by: string;
};

export type OpenAICompatibleListModelsResponse = {
    object: "list";
    data: OpenAICompatibleModel[];
};
