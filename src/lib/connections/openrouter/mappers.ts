import {
    getMessageContent,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "#frontend/lib/messages";
import type { Message } from "#frontend/types";

import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "../types";
import type {
    OpenRouterChatCompletionRequest,
    OpenRouterChatCompletionResponse,
    OpenRouterChatMessage,
    OpenRouterConnectionConfig,
    OpenRouterProviderPreferences,
    OpenRouterReasoningConfig,
} from "./types";

export function createOpenRouterChatCompletionBody(
    request: ChatGenerationRequest,
    config: OpenRouterConnectionConfig,
): OpenRouterChatCompletionRequest {
    const messages = request.promptMessages?.length
        ? request.promptMessages.map(toOpenRouterPromptMessage)
        : legacyMessages(request);
    const provider = cleanProviderPreferences(config.providerPreferences);
    const reasoning = cleanReasoningConfig(config.reasoning);

    return {
        model: config.model.id,
        messages,
        stream: request.stream === true,
        ...(provider ? { provider } : {}),
        ...(reasoning ? { reasoning } : {}),
    };
}

export function normalizeOpenRouterChatCompletion(
    response: OpenRouterChatCompletionResponse,
): ChatGenerationResult {
    const firstChoice = response.choices[0];

    if (firstChoice?.error?.message) {
        throw new Error(`OpenRouter provider error: ${firstChoice.error.message}`);
    }

    const responseMessage = firstChoice?.message;
    const message = responseMessage?.content?.trim();

    if (!message) {
        throw new Error("OpenRouter response did not include message content.");
    }

    return {
        message,
        provider: "openrouter",
        model: response.model,
        ...(responseMessage?.reasoning?.trim()
            ? { reasoning: responseMessage.reasoning.trim() }
            : {}),
        ...(responseMessage?.reasoning_details !== undefined
            ? { reasoningDetails: responseMessage.reasoning_details }
            : {}),
        raw: response,
    };
}

export function cleanReasoningConfig(
    reasoning: OpenRouterReasoningConfig | undefined,
): OpenRouterReasoningConfig | undefined {
    if (!reasoning) {
        return undefined;
    }

    const clean: OpenRouterReasoningConfig = {};

    if (
        typeof reasoning.max_tokens === "number" &&
        Number.isInteger(reasoning.max_tokens) &&
        reasoning.max_tokens > 0
    ) {
        clean.max_tokens = reasoning.max_tokens;
    } else if (
        reasoning.effort &&
        reasoning.effort !== "none" &&
        ["xhigh", "high", "medium", "low", "minimal"].includes(reasoning.effort)
    ) {
        clean.effort = reasoning.effort;
    }

    if (typeof reasoning.exclude === "boolean") {
        clean.exclude = reasoning.exclude;
    }

    return clean.effort || clean.max_tokens || clean.exclude !== undefined
        ? clean
        : undefined;
}

export function cleanProviderPreferences(
    preferences: OpenRouterProviderPreferences | undefined,
): OpenRouterProviderPreferences | undefined {
    if (!preferences) {
        return undefined;
    }

    const clean: OpenRouterProviderPreferences = {};

    if (preferences.sort) {
        clean.sort = preferences.sort;
    }

    if (typeof preferences.allow_fallbacks === "boolean") {
        clean.allow_fallbacks = preferences.allow_fallbacks;
    }

    if (typeof preferences.require_parameters === "boolean") {
        clean.require_parameters = preferences.require_parameters;
    }

    if (preferences.data_collection) {
        clean.data_collection = preferences.data_collection;
    }

    if (typeof preferences.zdr === "boolean") {
        clean.zdr = preferences.zdr;
    }

    const order = cleanSlugList(preferences.order);
    const only = cleanSlugList(preferences.only);
    const ignore = cleanSlugList(preferences.ignore);

    if (order.length) {
        clean.order = order;
    }

    if (only.length) {
        clean.only = only;
    }

    if (ignore.length) {
        clean.ignore = ignore;
    }

    return Object.keys(clean).length ? clean : undefined;
}

export function parseOpenRouterSlugList(value: string) {
    return cleanSlugList(value.split(/[\n,]/));
}

export function formatOpenRouterSlugList(value: string[] | undefined) {
    return cleanSlugList(value).join(", ");
}

function toOpenRouterPromptMessage(
    message: ChatGenerationMessage,
): OpenRouterChatMessage {
    return {
        role: message.role === "developer" ? "system" : message.role,
        content: message.content,
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
        ...(message.reasoningDetails !== undefined
            ? { reasoning_details: message.reasoningDetails }
            : {}),
    };
}

function toOpenRouterMessage(message: Message): OpenRouterChatMessage {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: message.role === "user" ? "user" : "assistant",
        content: getMessageContent(message),
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails !== undefined
            ? { reasoning_details: reasoningDetails }
            : {}),
    };
}

function legacyMessages(request: ChatGenerationRequest): OpenRouterChatMessage[] {
    const messages = request.messages.map(toOpenRouterMessage);

    if (!request.context?.trim()) {
        return messages;
    }

    return [
        {
            role: "system",
            content: request.context,
        },
        ...messages,
    ];
}

function cleanSlugList(value: string[] | undefined) {
    return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}
