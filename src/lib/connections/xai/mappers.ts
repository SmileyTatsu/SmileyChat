import { MessageRole } from "#frontend/types";

import {
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import { stopSequencesForGeneration } from "../generation-settings";
import { defaultOutputTokenLimit } from "../output-tokens";
import { ChatGenerationMessageRole } from "../types";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
import type {
    XAIChatCompletionRequest,
    XAIChatCompletionResponse,
    XAIConnectionConfig,
    XAIReasoningConfig,
} from "./types";

export function createXAIChatCompletionBody(
    request: ChatGenerationRequest,
    config: XAIConnectionConfig,
): XAIChatCompletionRequest {
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
    const reasoning = cleanXAIReasoningConfig(config.reasoning);
    const generation = request.generation;

    return {
        model: config.model.id,
        messages,
        max_completion_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(typeof generation?.seed === "number" ? { seed: generation.seed } : {}),
        ...(!reasoning && typeof generation?.presencePenalty === "number"
            ? { presence_penalty: generation.presencePenalty }
            : {}),
        ...(!reasoning && typeof generation?.frequencyPenalty === "number"
            ? { frequency_penalty: generation.frequencyPenalty }
            : {}),
        ...(!reasoning && stopSequencesForGeneration(generation)
            ? { stop: stopSequencesForGeneration(generation) }
            : {}),
        ...(reasoning?.effort ? { reasoning_effort: reasoning.effort } : {}),
        stream: request.stream === true,
    };
}

export function normalizeXAIChatCompletion(
    response: XAIChatCompletionResponse,
): ChatGenerationResult {
    return normalizeChatCompletionResponse(response, {
        provider: "xai",
        emptyMessage: "xAI response did not include message content.",
    });
}

export function cleanXAIReasoningConfig(
    reasoning: XAIReasoningConfig | undefined,
): Extract<XAIReasoningConfig, { enabled: true }> | undefined {
    if (!reasoning?.enabled) {
        return undefined;
    }

    if (
        reasoning.effort !== undefined &&
        reasoning.effort !== "low" &&
        reasoning.effort !== "medium" &&
        reasoning.effort !== "high"
    ) {
        return { enabled: true };
    }

    return {
        enabled: true,
        ...(reasoning.effort ? { effort: reasoning.effort } : {}),
    };
}
