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
    const staticPromptTokens =
        estimateChatGenerationMessagesTokens(staticPromptMessages);
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

function estimateChatGenerationMessagesTokens(
    messages: ChatGenerationMessage[],
) {
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

        return total + 1024 + estimateTextTokens(part.image_url.url);
    }, 0);
}
