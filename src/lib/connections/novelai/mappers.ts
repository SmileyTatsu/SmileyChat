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

import { eratoLogitBias, kayraLogitBias } from "./constants";
import type {
    NovelAICompletionResponse,
    NovelAIGenerationRequest,
    NovelAIRuntimeConfig,
} from "./types";

export function createNovelAIBody(
    request: ChatGenerationRequest,
    config: NovelAIRuntimeConfig,
): NovelAIGenerationRequest {
    const generation = request.generation;
    const stop = stopSequencesForGeneration(generation);
    const logitBias = logitBiasForModel(config.model.id);
    const messages = createChatCompletionMessages(request, {
        mapPromptRole: (role) =>
            role === ChatGenerationMessageRole.Developer
                ? ChatGenerationMessageRole.System
                : role,
        mapHistoryRole: (message) =>
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
    }).map((message) => ({
        role: message.role,
        content: messageContentToText(message.content),
    }));

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

function logitBiasForModel(modelId: string) {
    if (modelId.includes("erato")) {
        return eratoLogitBias;
    }

    if (modelId.includes("kayra") || modelId.includes("clio")) {
        return kayraLogitBias;
    }

    return undefined;
}
