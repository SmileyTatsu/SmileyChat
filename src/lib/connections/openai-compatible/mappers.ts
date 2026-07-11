import { stopSequencesForGeneration } from "../generation-settings";
import {
    chatCompletionTools,
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import { defaultOutputTokenLimit } from "../output-tokens";
import { ChatGenerationMessageRole } from "../types";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
import { MessageRole } from "#frontend/types";
import type {
    OpenAICompatibleChatCompletionRequest,
    OpenAICompatibleChatCompletionResponse,
    OpenAICompatibleConnectionConfig,
    OpenAICompatibleReasoningConfig,
} from "./types";

export function createChatCompletionBody(
    request: ChatGenerationRequest,
    config: OpenAICompatibleConnectionConfig,
): OpenAICompatibleChatCompletionRequest {
    const includeReasoningHistory =
        config.reasoning?.enabled === true &&
        config.reasoning.wireFormat === "chat-reasoning-object";
    const messages = createChatCompletionMessages(request, {
        includeReasoningHistory,
        mapPromptRole: (role) => role,
        mapHistoryRole: (message) =>
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
    });
    const reasoning = cleanReasoningConfig(config.reasoning);

    return {
        model: config.model.id,
        messages,
        max_completion_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        ...(typeof request.generation?.temperature === "number"
            ? { temperature: request.generation.temperature }
            : {}),
        ...(typeof request.generation?.topP === "number"
            ? { top_p: request.generation.topP }
            : {}),
        ...(typeof request.generation?.presencePenalty === "number"
            ? { presence_penalty: request.generation.presencePenalty }
            : {}),
        ...(typeof request.generation?.frequencyPenalty === "number"
            ? { frequency_penalty: request.generation.frequencyPenalty }
            : {}),
        ...(typeof request.generation?.seed === "number"
            ? { seed: request.generation.seed }
            : {}),
        ...(stopSequencesForGeneration(request.generation)
            ? { stop: stopSequencesForGeneration(request.generation) }
            : {}),
        ...(reasoning?.wireFormat === "chat-reasoning-effort"
            ? { reasoning_effort: reasoning.effort }
            : {}),
        ...(reasoning?.wireFormat === "chat-reasoning-object"
            ? { reasoning: { effort: reasoning.effort } }
            : {}),
        ...(chatCompletionTools(request.tools)
            ? { tools: chatCompletionTools(request.tools) }
            : {}),
        stream: request.stream === true,
    };
}

export function normalizeChatCompletion(
    response: OpenAICompatibleChatCompletionResponse,
): ChatGenerationResult {
    return normalizeChatCompletionResponse(response, {
        provider: "openai-compatible",
        emptyMessage: "OpenAI-compatible response did not include message content.",
    });
}

export function cleanReasoningConfig(
    reasoning: OpenAICompatibleReasoningConfig | undefined,
): OpenAICompatibleReasoningConfig | undefined {
    if (!reasoning?.enabled) {
        return undefined;
    }

    const effort = normalizeReasoningEffort(reasoning.effort);

    if (!effort) {
        return undefined;
    }

    return {
        enabled: true,
        effort,
        wireFormat:
            reasoning.wireFormat === "chat-reasoning-object"
                ? "chat-reasoning-object"
                : "chat-reasoning-effort",
    };
}

function normalizeReasoningEffort(
    value: unknown,
): OpenAICompatibleReasoningConfig["effort"] | undefined {
    return value === "xhigh" ||
        value === "high" ||
        value === "medium" ||
        value === "low" ||
        value === "minimal" ||
        value === "none"
        ? value
        : undefined;
}
