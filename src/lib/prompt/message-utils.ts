import type { Message } from "#frontend/types";

export function getPromptEligibleMessages(messages: Message[]) {
    return messages.filter(
        (message) =>
            message.metadata?.includeInPrompt !== false &&
            message.metadata?.promptRole !== "none",
    );
}

export function getMessageTurnIndex(messages: Message[], messageId: string) {
    return getPromptEligibleMessages(messages).findIndex(
        (message) => message.id === messageId,
    );
}

export function getLastUserMessage(messages: Message[]) {
    return findLastMessageByRole(messages, "user");
}

export function getLastCharacterMessage(messages: Message[]) {
    return findLastMessageByRole(messages, "character");
}

function findLastMessageByRole(messages: Message[], role: Message["role"]) {
    const promptMessages = getPromptEligibleMessages(messages);

    for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
        if (promptMessages[index].role === role) {
            return promptMessages[index];
        }
    }

    return undefined;
}
