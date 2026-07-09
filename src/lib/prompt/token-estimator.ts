import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
} from "../messages";
import type { PromptInjection } from "./types";

const bytesPerToken = 3.35;
const textEncoder = new TextEncoder();

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

    return Math.ceil(textEncoder.encode(value).length / bytesPerToken);
}

export function estimateMessage(message: Message) {
    return (
        6 +
        estimateText(message.author) +
        estimateText(getMessageContent(message)) +
        estimateText(getMessageReasoning(message)) +
        getMessageAttachments(message).length * 1024
    );
}

export function estimateGenerationMessage(message: ChatGenerationMessage) {
    return 4 + estimateText(message.role) + estimateContentTokens(message.content);
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
