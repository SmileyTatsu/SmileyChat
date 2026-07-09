import type { Message } from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
} from "../messages";
import { compilePresetMessages } from "./compile";
import type { SmileyPreset } from "./types";

const bytesPerToken = 3.35;
const textEncoder = new TextEncoder();

const contextEstimatePaddingTokens = 1024;

type PresetContextInput = Parameters<typeof compilePresetMessages>[1];

export function preparePresetContextForBudget({
    context,
    preset,
    tokenBudget,
}: {
    context: PresetContextInput;
    preset: SmileyPreset | undefined;
    tokenBudget: number;
}) {
    const staticPromptMessages = compilePresetMessages(preset, {
        ...context,
        messages: [],
    });
    const staticPromptTokens = estimateChatGenerationMessagesTokens(staticPromptMessages);
    const messages = trimMessagesForEstimatedContext({
        messages: context.messages,
        reservedTokens: staticPromptTokens + contextEstimatePaddingTokens,
        tokenBudget,
    });
    const promptMessages = compilePresetMessages(preset, {
        ...context,
        messages,
    });

    return {
        messages,
        promptMessages,
    };
}

function estimateTextTokens(value: string) {
    if (!value) {
        return 0;
    }

    return Math.ceil(textEncoder.encode(value).length / bytesPerToken);
}

function estimateChatGenerationMessagesTokens(messages: ChatGenerationMessage[]) {
    return messages.reduce(
        (total, message) => total + estimateChatGenerationMessageTokens(message),
        0,
    );
}

function trimMessagesForEstimatedContext({
    messages,
    reservedTokens,
    tokenBudget,
}: {
    messages: Message[];
    reservedTokens: number;
    tokenBudget: number;
}) {
    if (messages.length <= 1) {
        return messages;
    }

    const availableTokens = Math.max(0, Math.floor(tokenBudget - reservedTokens));
    const selected: Message[] = [];
    let selectedTokens = 0;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const messageTokens = estimateMessageTokens(message);

        if (selected.length > 0 && selectedTokens + messageTokens > availableTokens) {
            break;
        }

        selected.unshift(message);
        selectedTokens += messageTokens;
    }

    return selected.length > 0 ? selected : [messages[messages.length - 1]];
}

function estimateMessageTokens(message: Message) {
    return (
        6 +
        estimateTextTokens(message.author) +
        estimateTextTokens(getMessageContent(message)) +
        estimateTextTokens(getMessageReasoning(message)) +
        getMessageAttachments(message).length * 1024
    );
}

function estimateChatGenerationMessageTokens(message: ChatGenerationMessage) {
    return 4 + estimateTextTokens(message.role) + estimateContentTokens(message.content);
}

function estimateContentTokens(content: ChatGenerationMessage["content"]) {
    if (typeof content === "string") {
        return estimateTextTokens(content);
    }

    return content.reduce((total, part) => {
        if (part.type === "text") {
            return total + estimateTextTokens(part.text);
        }

        if (part.type === "image_url") {
            return total + 1024 + estimateTextTokens(part.image_url.url);
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
    const metadataTokens = estimateTextTokens(
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
