import type { Message } from "#frontend/types";

import { estimateMessage } from "./token-estimator";
import { getPromptEligibleMessages, isMessageIncludedInPrompt } from "./message-utils";

export function selectHistoryMessagesForBudget({
    messages,
    availableHistoryTokens,
}: {
    messages: Message[];
    availableHistoryTokens: number;
}): Message[] {
    const eligible = getPromptEligibleMessages(messages);

    if (eligible.length === 0) {
        return [];
    }

    if (eligible.length === 1) {
        return eligible;
    }

    const protectedId = protectedHistoryMessageId(eligible);
    const availableTokens = Math.max(0, Math.floor(availableHistoryTokens));
    const selected: Message[] = [];
    let selectedTokens = 0;
    let index = eligible.length - 1;

    while (index >= 0) {
        const groupStart = toolProtocolGroupStart(eligible, index);
        const group = eligible.slice(groupStart, index + 1);
        const groupTokens = group.reduce(
            (total, message) => total + estimateMessage(message),
            0,
        );
        const includesProtected = group.some((message) => message.id === protectedId);
        const canAdd =
            selected.length === 0 ||
            includesProtected ||
            selectedTokens + groupTokens <= availableTokens;

        if (!canAdd) {
            break;
        }

        selected.unshift(...group);
        selectedTokens += groupTokens;
        index = groupStart - 1;
    }

    if (selected.length === 0) {
        const protectedMessage =
            eligible.find((message) => message.id === protectedId) ??
            eligible[eligible.length - 1];
        return protectedMessage ? [protectedMessage] : [];
    }

    if (protectedId && !selected.some((message) => message.id === protectedId)) {
        const protectedMessage = eligible.find((message) => message.id === protectedId);

        if (protectedMessage) {
            return [protectedMessage];
        }
    }

    return selected;
}

export function protectedHistoryMessageId(messages: Message[]) {
    const promptMessages = messages.filter(isMessageIncludedInPrompt);

    for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
        if (promptMessages[index].role === "user") {
            return promptMessages[index].id;
        }
    }

    return promptMessages[promptMessages.length - 1]?.id;
}

function toolProtocolGroupStart(messages: Message[], index: number) {
    let start = index;

    while (
        start > 0 &&
        areAdjacentToolProtocolMessages(messages[start - 1], messages[start])
    ) {
        start -= 1;
    }

    return start;
}

function areAdjacentToolProtocolMessages(
    left: Message | undefined,
    right: Message | undefined,
) {
    if (!left || !right) {
        return false;
    }

    const leftCallIds = new Set((left.toolCalls ?? []).map((toolCall) => toolCall.id));
    const rightCallIds = new Set((right.toolCalls ?? []).map((toolCall) => toolCall.id));

    return Boolean(
        (right.toolResult && leftCallIds.has(right.toolResult.toolCallId)) ||
        (left.toolResult && rightCallIds.has(left.toolResult.toolCallId)),
    );
}
