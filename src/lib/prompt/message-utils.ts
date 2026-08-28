import type { Message } from "#frontend/types";

import { getActiveSwipe } from "../messages";

export function isMessageIncludedInPrompt(message: Message) {
    if (
        message.toolCalls?.length ||
        message.toolResult ||
        getActiveSwipe(message)?.toolActivities?.length
    ) {
        return true;
    }

    return (
        message.metadata?.includeInPrompt !== false &&
        message.metadata?.promptRole !== "none"
    );
}

export function getPromptEligibleMessages(messages: Message[]) {
    return messages.filter(isMessageIncludedInPrompt);
}
