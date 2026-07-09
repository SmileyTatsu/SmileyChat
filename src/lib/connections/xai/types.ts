import type { ChatGenerationMessageContentPart } from "../types";

export type XAIConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    maxCompletionTokens?: number;
    model: XAIModelSelection;
    reasoning?: XAIReasoningConfig;
};

export type XAIRuntimeConfig = XAIConnectionConfig;

export type XAIModelSelection =
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

export type XAIReasoningConfig =
    | {
          enabled?: false;
      }
    | {
          enabled: true;
          effort?: "low" | "medium" | "high";
      };

export type XAIChatMessage = {
    role: "system" | "user" | "assistant";
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoning_details?: unknown;
};

export type XAIChatCompletionRequest = {
    frequency_penalty?: number;
    model: string;
    messages: XAIChatMessage[];
    max_completion_tokens: number;
    presence_penalty?: number;
    reasoning_effort?: Extract<XAIReasoningConfig, { enabled: true }>["effort"];
    seed?: number;
    stop?: string[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
};

export type XAIChatCompletionResponse = {
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
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
    };
};

export type XAIResponsesRequest = {
    input: Array<{
        content: Array<
            | {
                  type: "input_text";
                  text: string;
              }
            | {
                  type: "input_image";
                  image_url: string;
              }
            | {
                  type: "input_file";
                  file_id?: string;
                  file_url?: string;
                  filename?: string;
                  file_data?: string;
              }
        >;
        role: "assistant" | "system" | "user";
    }>;
    max_output_tokens?: number;
    model: string;
    reasoning_effort?: Extract<XAIReasoningConfig, { enabled: true }>["effort"];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
};

export type XAIResponsesResponse = {
    id?: string;
    model?: string;
    output?: Array<{
        content?: Array<{
            text?: string;
            type?: string;
        }>;
        type?: string;
    }>;
    output_text?: string;
};

export type XAIErrorResponse = {
    error?: {
        message?: string;
        type?: string;
        code?: string | number;
    };
};

export type XAIModel = {
    aliases?: string[];
    context_length?: number;
    created: number;
    id: string;
    object: "model";
    owned_by: string;
    prompt_text_token_price?: number;
    cached_prompt_text_token_price?: number;
    prompt_image_token_price?: number;
    completion_text_token_price?: number;
    prompt_text_token_price_long_context?: number;
    completion_text_token_price_long_context?: number;
    long_context_threshold?: number;
};

export type XAIListModelsResponse = {
    object: "list";
    data: XAIModel[];
};
