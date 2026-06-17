import {
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import { messageContentToText } from "../images";
import { stopSequencesForGeneration } from "../generation-settings";
import { defaultOutputTokenLimit } from "../output-tokens";
import { MessageRole } from "#frontend/types";
import { ChatGenerationMessageRole } from "../types";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";

import {
    eratoLogitBias,
    kayraLogitBias,
    novelAITextGenerationMaxOutputTokens,
} from "./constants";
import type {
    NovelAIChatMessage,
    NovelAICompletionResponse,
    NovelAIGenerationRequest,
    NovelAITextGenerationRequest,
    NovelAITextGenerationResponse,
    NovelAIRuntimeConfig,
} from "./types";

export function createNovelAIBody(
    request: ChatGenerationRequest,
    config: NovelAIRuntimeConfig,
): NovelAIGenerationRequest {
    const generation = request.generation;
    const stop = stopSequencesForGeneration(generation);
    const logitBias = logitBiasForModel(config.model.id);
    const messages = createNovelAIMessages(request);

    return {
        model: config.model.id,
        messages,
        max_tokens: config.maxOutputTokens ?? defaultOutputTokenLimit,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(typeof generation?.topK === "number" ? { top_k: generation.topK } : {}),
        ...(typeof generation?.frequencyPenalty === "number"
            ? { frequency_penalty: generation.frequencyPenalty }
            : {}),
        ...(typeof generation?.presencePenalty === "number"
            ? { presence_penalty: generation.presencePenalty }
            : {}),
        ...(stop ? { stop } : {}),
        ...(logitBias ? { logit_bias: logitBias } : {}),
        stream: request.stream === true,
        unified_linear: 0,
        unified_quadratic: 0,
        unified_increase_linear_with_entropy: 0,
        unified_cubic: 0,
    };
}

export function createNovelAITextGenerationBody(
    request: ChatGenerationRequest,
    config: NovelAIRuntimeConfig,
): NovelAITextGenerationRequest {
    const generation = request.generation;
    const input = createNovelAITextGenerationInput(createNovelAIMessages(request));
    const maxTokens = config.maxOutputTokens ?? defaultOutputTokenLimit;

    return {
        model: config.model.id,
        input,
        parameters: {
            use_string: true,
            max_length: Math.min(maxTokens, novelAITextGenerationMaxOutputTokens),
            min_length: 1,
            ...(typeof generation?.temperature === "number"
                ? { temperature: generation.temperature }
                : {}),
            ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
            ...(typeof generation?.topK === "number" ? { top_k: generation.topK } : {}),
            ...(typeof generation?.minP === "number" ? { min_p: generation.minP } : {}),
            ...(typeof generation?.repetitionPenalty === "number"
                ? { repetition_penalty: generation.repetitionPenalty }
                : {}),
            ...(typeof generation?.frequencyPenalty === "number"
                ? { repetition_penalty_frequency: generation.frequencyPenalty }
                : {}),
            ...(typeof generation?.presencePenalty === "number"
                ? { repetition_penalty_presence: generation.presencePenalty }
                : {}),
        },
    };
}

function createNovelAITextGenerationInput(messages: NovelAIChatMessage[]) {
    const lines = messages.flatMap((message) => {
        const content = message.content.trim();
        if (!content) {
            return [];
        }

        if (message.role === "system") {
            return [content, ""];
        }

        return [`${message.role === "user" ? "User" : "Assistant"}: ${content}`];
    });

    return [...lines, "Assistant:"].join("\n").trimStart();
}

function createNovelAIMessages(request: ChatGenerationRequest): NovelAIChatMessage[] {
    return createChatCompletionMessages(request, {
        mapPromptRole: (role) =>
            role === ChatGenerationMessageRole.Developer
                ? ChatGenerationMessageRole.System
                : role,
        mapHistoryRole: (message) =>
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
    }).map((message) => ({
        role: message.role as "system" | "user" | "assistant",
        content: messageContentToText(message.content),
    }));
}

export function normalizeNovelAICompletion(
    response: NovelAICompletionResponse,
    model: string,
): ChatGenerationResult {
    return normalizeChatCompletionResponse(
        {
            ...response,
            choices: response.choices ?? [],
            model: response.model ?? model,
        },
        {
            provider: "novelai",
            providerErrorPrefix: "NovelAI response error",
            emptyMessage: "NovelAI response did not include message content.",
        },
    );
}

export function normalizeNovelAITextGenerationCompletion(
    response: NovelAITextGenerationResponse,
    model: string,
): ChatGenerationResult {
    const message = response.output?.trim();

    if (!message) {
        throw new Error("NovelAI response did not include message content.");
    }

    return {
        message,
        model,
        provider: "novelai",
        raw: response,
    };
}

function logitBiasForModel(modelId: string) {
    if (modelId.includes("erato")) {
        return eratoLogitBias;
    }

    if (modelId.includes("kayra")) {
        return kayraLogitBias;
    }

    return undefined;
}
