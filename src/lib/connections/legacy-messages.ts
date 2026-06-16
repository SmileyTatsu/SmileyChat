import { getMessageContent } from "#frontend/lib/messages";

import { MessageRole, type Message } from "#frontend/types";
import type { ChatGenerationMessage, ChatGenerationRequest } from "./types";
import { ChatGenerationMessageRole } from "./types";

export function legacyMessages(request: ChatGenerationRequest): ChatGenerationMessage[] {
    const messages = request.messages.map(toPromptMessage);

    if (!request.context?.trim()) {
        return messages;
    }

    return [
        {
            role: ChatGenerationMessageRole.System,
            content: request.context,
        },
        ...messages,
    ];
}

export function toPromptMessage(message: Message): ChatGenerationMessage {
    return {
        role:
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
        content: getMessageContent(message),
    };
}
