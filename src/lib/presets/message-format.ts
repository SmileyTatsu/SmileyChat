import type { Message } from "#frontend/types";

import { getMessageContent } from "../messages";
import type { MacroContext } from "./macros";

export type PromptGroupContext = MacroContext["group"];

export function messageAuthorForPrompt(message: Message, group: PromptGroupContext) {
    if (
        message.role !== "character" ||
        !message.authorCharacterId ||
        !group?.memberIds?.includes(message.authorCharacterId)
    ) {
        return `${message.author}: `;
    }

    const prefixTemplate = group.joinPrefix ?? "{{char}}:";
    const prefix = prefixTemplate.replace(/\{\{char\}\}/g, message.author);

    return prefix ? `${prefix} ` : "";
}

export function messageTextForHistory(
    message: Message,
    context: Pick<MacroContext, "group">,
    content = getMessageContent(message),
) {
    return `${messageAuthorForPrompt(message, context.group)}${content}`;
}
