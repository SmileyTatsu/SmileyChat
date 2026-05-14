import type { Message } from "../../../types";
import { getMessageContent } from "../../messages";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
import type {
    OpenAICompatibleChatCompletionRequest,
    OpenAICompatibleChatCompletionResponse,
    OpenAICompatibleChatMessage,
    OpenAICompatibleConnectionConfig,
} from "./types";

export function createChatCompletionBody(
    request: ChatGenerationRequest,
    config: OpenAICompatibleConnectionConfig,
): OpenAICompatibleChatCompletionRequest {
    const messages = request.promptMessages?.length
        ? request.promptMessages
        : legacyMessages(request);

    return {
        model: config.model.id,
        messages,
        stream: request.stream === true,
    };
}

export function normalizeChatCompletion(
    response: OpenAICompatibleChatCompletionResponse,
): ChatGenerationResult {
    const message = response.choices[0]?.message.content?.trim();

    if (!message) {
        throw new Error("OpenAI-compatible response did not include message content.");
    }

    return {
        message,
        provider: "openai-compatible",
        model: response.model,
        raw: response,
    };
}

function toOpenAICompatibleMessage(message: Message): OpenAICompatibleChatMessage {
    return {
        role: message.role === "user" ? "user" : "assistant",
        content: getMessageContent(message),
    };
}

function legacyMessages(request: ChatGenerationRequest): OpenAICompatibleChatMessage[] {
    const messages = request.messages.map(toOpenAICompatibleMessage);

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
