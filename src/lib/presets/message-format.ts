import type { Message } from "#frontend/types";

import { getMessageContent } from "../messages";
import type { MacroContext } from "./macros";
import type { PresetFormattingSettings } from "./types";

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

export function buildSpeakerPrefixPattern(name: string): RegExp {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
        `^\\s*(?:` +
            `<${escaped}>\\s*:?|` +
            `\\[${escaped}\\]\\s*:?|` +
            `\\(${escaped}\\)\\s*:?|` +
            `\\*\\*${escaped}\\*\\*\\s*:|` +
            `\\*\\*${escaped}:\\*\\*|` +
            `\\*${escaped}\\*\\s*:|` +
            `\\*${escaped}:\\*|` +
            `${escaped}\\s*:` +
            `)\\s*`,
        "i",
    );
}

export function prefixMessageAuthor(
    author: string,
    content: string,
    prefix = `${author}: `,
): string {
    if (!author || !content) {
        return content;
    }

    const trimmedAuthor = author.trim();
    if (!trimmedAuthor) {
        return content;
    }

    const trimmedPrefix = prefix.trim();
    if (trimmedPrefix) {
        const escapedPrefix = trimmedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prefixPattern = new RegExp(`^\\s*${escapedPrefix}\\s*`, "i");
        if (prefixPattern.test(content)) {
            return content;
        }
    }

    const pattern = buildSpeakerPrefixPattern(trimmedAuthor);
    if (pattern.test(content)) {
        return content;
    }

    return `${prefix}${content}`;
}

export function stripLeadingSpeakerPrefix(
    content: string,
    candidates: Array<string | undefined | null> = [],
): string {
    if (!content) {
        return content;
    }

    const names = new Set<string>();
    for (const item of candidates) {
        if (typeof item === "string" && item.trim()) {
            names.add(item.trim());
        }
    }
    names.add("{{char}}");
    names.add("{{user}}");
    names.add("char");
    names.add("user");
    names.add("assistant");

    let result = content;

    for (const name of names) {
        const pattern = buildSpeakerPrefixPattern(name);
        if (pattern.test(result)) {
            result = result.replace(pattern, "");
            break;
        }
    }

    return result;
}

export function messageTextForHistory(
    message: Message,
    context: {
        group?: MacroContext["group"];
        formatting?: PresetFormattingSettings;
        personaName?: string;
    },
    content = getMessageContent(message),
) {
    const behavior = context.formatting?.namesBehavior ?? "always";
    const isGroupCharacter =
        message.role === "character" &&
        Boolean(
            message.authorCharacterId &&
            context.group?.memberIds?.includes(message.authorCharacterId),
        );
    const isPastPersona =
        message.role === "user" &&
        Boolean(
            context.personaName &&
            message.author &&
            message.author !== context.personaName,
        );
    const includeName =
        behavior === "always" ||
        (behavior === "force" && (isGroupCharacter || isPastPersona));

    if (includeName) {
        const prefix =
            message.role === "character" &&
            message.authorCharacterId &&
            context.group?.memberIds?.includes(message.authorCharacterId)
                ? messageAuthorForPrompt(message, context.group)
                : `${message.author}: `;
        return prefixMessageAuthor(message.author, content, prefix);
    }

    return content;
}
