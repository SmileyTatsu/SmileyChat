import {
    getMessageAttachments,
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
    OpenAICompatibleChatCompletionRequest,
    OpenAICompatibleChatCompletionResponse,
    OpenAICompatibleChatMessage,
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
    const messages = request.promptMessages?.length
        ? request.promptMessages.map((message) =>
              toOpenAICompatiblePromptMessage(message, includeReasoningHistory),
          )
        : legacyMessages(request, includeReasoningHistory);
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
    const responseMessage = response.choices[0]?.message;
    const message = responseMessage?.content?.trim();

    if (!message) {
        throw new Error("OpenAI-compatible response did not include message content.");
    }

    return {
        message,
        provider: "openai-compatible",
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

function toOpenAICompatiblePromptMessage(
    message: ChatGenerationMessage,
    includeReasoningHistory: boolean,
): OpenAICompatibleChatMessage {
    return {
        role: message.role,
        content: message.content,
        ...(includeReasoningHistory && message.reasoning
            ? { reasoning: message.reasoning }
            : {}),
        ...(includeReasoningHistory && message.reasoningDetails !== undefined
            ? { reasoning_details: message.reasoningDetails }
            : {}),
    };
}

function toOpenAICompatibleMessage(
    message: Message,
    includeReasoningHistory: boolean,
): OpenAICompatibleChatMessage {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: message.role === "user" ? "user" : "assistant",
        content: messageContentWithAttachments(message),
        ...(includeReasoningHistory && reasoning ? { reasoning } : {}),
        ...(includeReasoningHistory && reasoningDetails !== undefined
            ? { reasoning_details: reasoningDetails }
            : {}),
    };
}

function messageContentWithAttachments(
    message: Message,
): OpenAICompatibleChatMessage["content"] {
    const content = getMessageContent(message);
    const attachments = getMessageAttachments(message);

    if (attachments.length === 0) {
        return content;
    }

    return [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments.map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.url },
        })),
    ];
}

function legacyMessages(
    request: ChatGenerationRequest,
    includeReasoningHistory: boolean,
): OpenAICompatibleChatMessage[] {
    const messages = request.messages.map((message) =>
        toOpenAICompatibleMessage(message, includeReasoningHistory),
    );

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
