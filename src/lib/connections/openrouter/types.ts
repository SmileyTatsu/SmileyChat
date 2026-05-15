export type OpenRouterConnectionConfig = {
    apiKey?: string;
    model: OpenRouterModelSelection;
    providerPreferences: OpenRouterProviderPreferences;
    reasoning?: OpenRouterReasoningConfig;
};

export type OpenRouterRuntimeConfig = OpenRouterConnectionConfig;

export type OpenRouterModelSelection = {
    source: "api";
    id: string;
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
    role: "system" | "user" | "assistant";
    content: string;
    reasoning?: string;
    reasoning_details?: unknown;
};

export type OpenRouterChatCompletionRequest = {
    model: string;
    messages: OpenRouterChatMessage[];
    stream: boolean;
    provider?: OpenRouterProviderPreferences;
    reasoning?: OpenRouterReasoningConfig;
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
            reasoning?: string | null;
            reasoning_details?: unknown;
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
