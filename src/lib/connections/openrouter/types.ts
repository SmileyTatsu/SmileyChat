import type { ChatCompletionTool } from "../chat-completions";
import type { ChatGenerationMessageContentPart } from "../types";

export type OpenRouterConnectionConfig = {
    apiKey?: string;
    maxCompletionTokens?: number;
    model: OpenRouterModelSelection;
    providerPreferences: OpenRouterProviderPreferences;
    reasoning?: OpenRouterReasoningConfig;
};

export type OpenRouterRuntimeConfig = OpenRouterConnectionConfig;

export type OpenRouterModelSelection = {
    source: "api";
    id: string;
    supportedParameters?: string[];
};

export type OpenRouterProviderPreferences = {
    sort?: OpenRouterSort;
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: "allow" | "deny";
    zdr?: boolean;
    order?: string[];
    only?: string[];
    ignore?: string[];
};

export type OpenRouterSort = "price" | "throughput" | "latency";

export type OpenRouterReasoningConfig = {
    effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
    max_tokens?: number;
    exclude?: boolean;
};

export type OpenRouterChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoning_details?: unknown;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
};

export type OpenRouterImage = {
    type: "image_url";
    image_url: {
        url: string;
    };
};

export type OpenRouterChatCompletionRequest = {
    frequency_penalty?: number;
    max_completion_tokens: number;
    min_p?: number;
    model: string;
    messages: OpenRouterChatMessage[];
    modalities?: string[];
    presence_penalty?: number;
    provider?: OpenRouterProviderPreferences;
    reasoning?: OpenRouterReasoningConfig;
    repetition_penalty?: number;
    seed?: number;
    stop?: string[];
    stream: boolean;
    temperature?: number;
    tools?: ChatCompletionTool[];
    top_a?: number;
    top_k?: number;
    top_p?: number;
};

export type OpenRouterChatCompletionResponse = {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: Array<{
        index?: number;
        message?: {
            role?: string;
            content: string | null;
            images?: OpenRouterImage[];
            reasoning?: string | null;
            reasoning_details?: unknown;
            tool_calls?: Array<{
                id: string;
                type: "function";
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
        finish_reason: string | null;
        native_finish_reason?: string | null;
        error?: {
            code: number | string;
            message: string;
            metadata?: Record<string, unknown>;
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
    };
};

export type OpenRouterResponsesRequest = {
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
    provider?: OpenRouterProviderPreferences;
    reasoning?: OpenRouterReasoningConfig;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
};

export type OpenRouterResponsesResponse = {
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

export type OpenRouterErrorResponse = {
    error?: {
        code?: number | string;
        message?: string;
        metadata?: Record<string, unknown>;
    };
};

export type OpenRouterModel = {
    id: string;
    name?: string;
    description?: string;
    created?: number;
    context_length?: number;
    pricing?: {
        prompt?: string;
        completion?: string;
        image?: string;
        request?: string;
    } | null;
    supported_parameters?: string[] | null;
    top_provider?: {
        context_length?: number;
        max_completion_tokens?: number;
        is_moderated?: boolean;
    } | null;
};

export type OpenRouterListModelsResponse = {
    data: OpenRouterModel[];
};
