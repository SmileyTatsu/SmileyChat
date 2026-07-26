import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
} from "../messages";
import type { PromptInjection } from "./types";

const bytesPerToken = 3.35;

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

export function estimateText(value: string) {
    if (!value) {
        return 0;
    }

    return Math.ceil(utf8ByteLength(value) / bytesPerToken);
}

/**
 * Matches TextEncoder's UTF-8 output length without allocating a Uint8Array.
 * Unpaired UTF-16 surrogates are encoded as U+FFFD, which is three bytes.
 */
function utf8ByteLength(value: string) {
    let byteLength = 0;

    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        if (codeUnit <= 0x7f) {
            byteLength += 1;
        } else if (codeUnit <= 0x7ff) {
            byteLength += 2;
        } else if (
            codeUnit >= 0xd800 &&
            codeUnit <= 0xdbff &&
            index + 1 < value.length &&
            value.charCodeAt(index + 1) >= 0xdc00 &&
            value.charCodeAt(index + 1) <= 0xdfff
        ) {
            byteLength += 4;
            index += 1;
        } else {
            byteLength += 3;
        }
    }

    return byteLength;
}

export function estimateMessage(message: Message) {
    return (
        6 +
        estimateText(message.author) +
        estimateText(getMessageContent(message)) +
        estimateText(getMessageReasoning(message)) +
        estimateMessageToolTokens(message) +
        getMessageAttachments(message).length * 1024
    );
}

export function estimateGenerationMessage(message: ChatGenerationMessage) {
    return (
        4 +
        estimateText(message.role) +
        estimateContentTokens(message.content) +
        estimateGenerationToolTokens(message)
    );
}

export function estimatePromptInjection(injection: PromptInjection) {
    return injection.tokenBudgetBehavior === "ignore-budget"
        ? 0
        : 4 + estimateText(injection.role) + estimateText(injection.content);
}

export function estimateChatGenerationMessages(messages: ChatGenerationMessage[]) {
    return messages.reduce(
        (total, message) => total + estimateGenerationMessage(message),
        0,
    );
}

function estimateContentTokens(content: ChatGenerationMessage["content"]) {
    if (typeof content === "string") {
        return estimateText(content);
    }

    return content.reduce((total, part) => {
        if (part.type === "text") {
            return total + estimateText(part.text);
        }

        if (part.type === "image_url") {
            return total + 1024 + estimateText(part.image_url.url);
        }

        return total + estimateFilePartTokens(part.file);
    }, 0);
}

function estimateFilePartTokens(file: {
    file_data?: string;
    filename?: string;
    mime_type?: string;
    size_bytes?: number;
    url?: string;
}) {
    const metadataTokens = estimateText(
        [file.filename, file.mime_type, file.url].filter(Boolean).join(" "),
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

function estimateMessageToolTokens(message: Message) {
    return (
        (message.toolCalls ?? []).reduce(
            (total, call) =>
                total +
                estimateText(call.id) +
                estimateText(call.name) +
                estimateText(call.argumentsText),
            0,
        ) +
        (message.toolResult
            ? estimateText(message.toolResult.toolCallId) +
              estimateText(message.toolResult.name) +
              estimateText(message.toolResult.content)
            : 0)
    );
}

function estimateGenerationToolTokens(message: ChatGenerationMessage) {
    return (
        (message.toolCalls ?? []).reduce(
            (total, call) =>
                total +
                estimateText(call.id) +
                estimateText(call.name) +
                estimateText(call.argumentsText),
            0,
        ) +
        (message.toolResult
            ? estimateText(message.toolResult.toolCallId) +
              estimateText(message.toolResult.name) +
              estimateText(message.toolResult.content)
            : 0)
    );
}
