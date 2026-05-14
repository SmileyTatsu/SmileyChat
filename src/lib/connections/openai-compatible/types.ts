export type OpenAICompatibleConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    model: OpenAICompatibleModelSelection;
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

export type OpenAICompatibleChatMessage = {
    role: "developer" | "system" | "user" | "assistant";
    content: string;
};

export type OpenAICompatibleChatCompletionRequest = {
    model: string;
    messages: OpenAICompatibleChatMessage[];
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
