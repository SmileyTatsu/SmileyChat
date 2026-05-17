import {
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
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
            message.role === "user" ? "user" : "assistant",
    });
    const reasoning = cleanReasoningConfig(config.reasoning);

    return {
        model: config.model.id,
        messages,
        ...(reasoning?.wireFormat === "chat-reasoning-effort"
            ? { reasoning_effort: reasoning.effort }
            : {}),
        ...(reasoning?.wireFormat === "chat-reasoning-object"
            ? { reasoning: { effort: reasoning.effort } }
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
