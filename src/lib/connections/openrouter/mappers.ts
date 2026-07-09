import { MessageRole } from "#frontend/types";
import { ChatGenerationMessageRole } from "../types";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
import { defaultOutputTokenLimit } from "../output-tokens";
import {
    filterOpenRouterGenerationParameters,
    stopSequencesForGeneration,
} from "../generation-settings";
import {
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import type {
    OpenRouterChatCompletionRequest,
    OpenRouterChatCompletionResponse,
    OpenRouterConnectionConfig,
    OpenRouterProviderPreferences,
    OpenRouterReasoningConfig,
    OpenRouterResponsesRequest,
    OpenRouterResponsesResponse,
} from "./types";

export function createOpenRouterChatCompletionBody(
    request: ChatGenerationRequest,
    config: OpenRouterConnectionConfig,
): OpenRouterChatCompletionRequest {
    const messages = createChatCompletionMessages(request, {
        includeReasoningHistory: true,
        mapPromptRole: (role) =>
            role === ChatGenerationMessageRole.Developer
                ? ChatGenerationMessageRole.System
                : role,
        mapHistoryRole: (message) =>
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
    });
    const provider = cleanProviderPreferences(config.providerPreferences);
    const reasoning = cleanReasoningConfig(config.reasoning);
    const generation = filterOpenRouterGenerationParameters(
        request.generation,
        config.model.supportedParameters,
    );

    return {
        model: config.model.id,
        messages,
        max_completion_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        stream: request.stream === true,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(typeof generation?.topK === "number" ? { top_k: generation.topK } : {}),
        ...(typeof generation?.minP === "number" ? { min_p: generation.minP } : {}),
        ...(typeof generation?.topA === "number" ? { top_a: generation.topA } : {}),
        ...(typeof generation?.presencePenalty === "number"
            ? { presence_penalty: generation.presencePenalty }
            : {}),
        ...(typeof generation?.frequencyPenalty === "number"
            ? { frequency_penalty: generation.frequencyPenalty }
            : {}),
        ...(typeof generation?.repetitionPenalty === "number"
            ? { repetition_penalty: generation.repetitionPenalty }
            : {}),
        ...(typeof generation?.seed === "number" ? { seed: generation.seed } : {}),
        ...(stopSequencesForGeneration(generation)
            ? { stop: stopSequencesForGeneration(generation) }
            : {}),
        ...(provider ? { provider } : {}),
        ...(reasoning ? { reasoning } : {}),
    };
}

export function normalizeOpenRouterChatCompletion(
    response: OpenRouterChatCompletionResponse,
): ChatGenerationResult {
    return normalizeChatCompletionResponse(response, {
        allowImages: true,
        provider: "openrouter",
        providerErrorPrefix: "OpenRouter provider error",
        emptyMessage: "OpenRouter response did not include message content.",
    });
}

export function createOpenRouterResponsesBody(
    request: ChatGenerationRequest,
    config: OpenRouterConnectionConfig,
): OpenRouterResponsesRequest {
    const generation = filterOpenRouterGenerationParameters(
        request.generation,
        config.model.supportedParameters,
    );
    const provider = cleanProviderPreferences(config.providerPreferences);
    const reasoning = cleanReasoningConfig(config.reasoning);

    return {
        model: config.model.id,
        input: (request.promptMessages ?? []).map((message) => ({
            role:
                message.role === ChatGenerationMessageRole.Assistant
                    ? ("assistant" as const)
                    : message.role === ChatGenerationMessageRole.System
                      ? ("system" as const)
                      : ("user" as const),
            content:
                typeof message.content === "string"
                    ? [{ type: "input_text" as const, text: message.content }]
                    : message.content.flatMap<
                          OpenRouterResponsesRequest["input"][number]["content"][number]
                      >((part) => {
                          if (part.type === "text") {
                              return [{ type: "input_text" as const, text: part.text }];
                          }

                          if (part.type === "file") {
                              const fileUrl = isHttpUrl(part.file.url)
                                  ? part.file.url
                                  : undefined;
                              const fileId =
                                  part.file.url && !fileUrl ? part.file.url : undefined;

                              return [
                                  {
                                      type: "input_file" as const,
                                      ...(fileId ? { file_id: fileId } : {}),
                                      ...(fileUrl ? { file_url: fileUrl } : {}),
                                      ...(part.file.file_data
                                          ? { file_data: part.file.file_data }
                                          : {}),
                                      ...(part.file.filename
                                          ? { filename: part.file.filename }
                                          : {}),
                                  },
                              ];
                          }

                          return [
                              {
                                  type: "input_image" as const,
                                  image_url: part.image_url.url,
                              },
                          ];
                      }),
        })),
        max_output_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        stream: request.stream === true,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(provider ? { provider } : {}),
        ...(reasoning ? { reasoning } : {}),
    };
}

function isHttpUrl(value: string | undefined) {
    return Boolean(value && /^https?:\/\//i.test(value));
}

export function normalizeOpenRouterResponsesResponse(
    response: OpenRouterResponsesResponse,
): ChatGenerationResult {
    const message =
        response.output_text?.trim() ||
        response.output
            ?.flatMap((item) => item.content ?? [])
            .map((item) => item.text ?? "")
            .join("")
            .trim() ||
        "";

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

function cleanSlugList(value: string[] | undefined) {
    return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}
