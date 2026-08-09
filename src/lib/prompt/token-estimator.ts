import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
} from "../messages";
import type { PromptInjection } from "./types";
import { estimateTextForContext, type TokenCountContext } from "../tokenizer";
import { providerTokenPolicy } from "../connections/token-policy";

export type TokenEstimator = {
    estimateGenerationMessage(message: ChatGenerationMessage): number;
    estimateMessage(message: Message): number;
    estimatePromptInjection(injection: PromptInjection): number;
    estimateText(value: string): number;
};

export const defaultTokenEstimator: TokenEstimator = {
    estimateGenerationMessage,
    estimateMessage,
    estimatePromptInjection,
    estimateText,
};

export function estimateText(value: string, context?: TokenCountContext) {
    return estimateTextForContext(value, context).tokens;
}

export function estimateMessage(message: Message, context?: TokenCountContext) {
    return (
        6 +
        estimateText(message.author, context) +
        estimateText(getMessageContent(message), context) +
        estimateText(getMessageReasoning(message), context) +
        estimateMessageToolTokens(message, context) +
        getMessageAttachments(message).length * 1024
    );
}

export function estimateGenerationMessage(
    message: ChatGenerationMessage,
    context?: TokenCountContext,
) {
    return (
        providerTokenPolicy(context).messageOverhead +
        estimateText(message.role, context) +
        estimateContentTokens(message.content, context) +
        estimateGenerationToolTokens(message, context)
    );
}

export function estimatePromptInjection(
    injection: PromptInjection,
    context?: TokenCountContext,
) {
    return injection.tokenBudgetBehavior === "ignore-budget"
        ? 0
        : providerTokenPolicy(context).messageOverhead +
              estimateText(injection.role, context) +
              estimateText(injection.content, context);
}

export function estimateChatGenerationMessages(
    messages: ChatGenerationMessage[],
    context?: TokenCountContext,
) {
    return messages.reduce(
        (total, message) => total + estimateGenerationMessage(message, context),
        0,
    );
}

function estimateContentTokens(
    content: ChatGenerationMessage["content"],
    context?: TokenCountContext,
) {
    if (typeof content === "string") {
        return estimateText(content, context);
    }

    return content.reduce((total, part) => {
        if (part.type === "text") {
            return total + estimateText(part.text, context);
        }

        if (part.type === "image_url") {
            return total + 1024 + estimateText(part.image_url.url, context);
        }

        return total + estimateFilePartTokens(part.file, context);
    }, 0);
}

function estimateFilePartTokens(
    file: {
        file_data?: string;
        filename?: string;
        mime_type?: string;
        size_bytes?: number;
        url?: string;
    },
    context?: TokenCountContext,
) {
    const metadataTokens = estimateText(
        [file.filename, file.mime_type, file.url].filter(Boolean).join(" "),
        context,
    );

    if (typeof file.size_bytes === "number" && file.size_bytes > 0) {
        return 256 + metadataTokens + Math.ceil(file.size_bytes / 4);
    }

    if (file.file_data) {
        const base64 = file.file_data.includes(",")
            ? file.file_data.slice(file.file_data.indexOf(",") + 1)
            : file.file_data;
        return 256 + metadataTokens + Math.ceil((base64.length * 3) / 4 / 4);
    }

    return 1024 + metadataTokens;
}

function estimateMessageToolTokens(message: Message, context?: TokenCountContext) {
    return (
        (message.toolCalls ?? []).reduce(
            (total, call) =>
                total +
                estimateText(call.id, context) +
                estimateText(call.name, context) +
                estimateText(call.argumentsText, context),
            0,
        ) +
        (message.toolResult
            ? estimateText(message.toolResult.toolCallId, context) +
              estimateText(message.toolResult.name, context) +
              estimateText(message.toolResult.content, context)
            : 0)
    );
}

function estimateGenerationToolTokens(
    message: ChatGenerationMessage,
    context?: TokenCountContext,
) {
    return (
        (message.toolCalls ?? []).reduce(
            (total, call) =>
                total +
                estimateText(call.id, context) +
                estimateText(call.name, context) +
                estimateText(call.argumentsText, context),
            0,
        ) +
        (message.toolResult
            ? estimateText(message.toolResult.toolCallId, context) +
              estimateText(message.toolResult.name, context) +
              estimateText(message.toolResult.content, context)
            : 0)
    );
}
