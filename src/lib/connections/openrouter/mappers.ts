import type { Message } from "../../../types";
import { getMessageContent } from "../../messages";
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
} from "./types";

export function createOpenRouterChatCompletionBody(
    request: ChatGenerationRequest,
    config: OpenRouterConnectionConfig,
): OpenRouterChatCompletionRequest {
    const messages = request.promptMessages?.length
        ? request.promptMessages.map(toOpenRouterPromptMessage)
        : legacyMessages(request);
    const provider = cleanProviderPreferences(config.providerPreferences);

    return {
        model: config.model.id,
        messages,
        stream: request.stream === true,
        ...(provider ? { provider } : {}),
    };
}

export function normalizeOpenRouterChatCompletion(
    response: OpenRouterChatCompletionResponse,
): ChatGenerationResult {
    const firstChoice = response.choices[0];

    if (firstChoice?.error?.message) {
        throw new Error(`OpenRouter provider error: ${firstChoice.error.message}`);
    }

    const message = firstChoice?.message?.content?.trim();

    if (!message) {
        throw new Error("OpenRouter response did not include message content.");
    }

    return {
        message,
        provider: "openrouter",
        model: response.model,
        raw: response,
    };
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

function toOpenRouterPromptMessage(message: ChatGenerationMessage): OpenRouterChatMessage {
    return {
        role: message.role === "developer" ? "system" : message.role,
        content: message.content,
    };
}

function toOpenRouterMessage(message: Message): OpenRouterChatMessage {
    return {
        role: message.role === "user" ? "user" : "assistant",
        content: getMessageContent(message),
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
    return Array.from(
        new Set(
            (value ?? [])
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}
