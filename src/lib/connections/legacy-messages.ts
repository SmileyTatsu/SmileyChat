import { getMessageContent } from "#frontend/lib/messages";

import type { Message } from "#frontend/types";
import type { ChatGenerationMessage, ChatGenerationRequest } from "./types";

export function legacyMessages(request: ChatGenerationRequest): ChatGenerationMessage[] {
    const messages = request.messages.map(toPromptMessage);

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

export function toPromptMessage(message: Message): ChatGenerationMessage {
    return {
        role: message.role === "user" ? "user" : "assistant",
        content: getMessageContent(message),
    };
}
