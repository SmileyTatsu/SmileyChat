import type { ChatMode, Message, SmileyCharacter, UserStatus } from "#frontend/types";

import { getCharacterTagline } from "../characters/normalize";
import { formatDate, formatDateTime, formatShortTime } from "../common/time";
import { getMessageContent } from "../messages";
import { getPluginMacroValue } from "../plugins/registry";
import { messageTextForHistory } from "./message-format";
import type { PromptOutletRegistry } from "../prompt/outlets";
import type { PromptGenerationContext } from "../prompt/types";

export type MacroContext = {
    character: SmileyCharacter;
    group?: {
        joinPrefix?: string;
        memberIds?: string[];
    };
    messages: Message[];
    mode: ChatMode;
    generation?: PromptGenerationContext;
    metadata?: Record<string, unknown>;
    outlets?: PromptOutletRegistry;
    personaName: string;
    personaDescription: string;
    userStatus: UserStatus;
};

type MacroValue = {
    recursive?: boolean;
    value: string;
};

const commentMacroPattern = /\{\{\/\/[\s\S]*?\}\}/g;
const macroPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
const maxNestedMacroDepth = 8;

export function resolvePresetMacros(content: string, context: MacroContext) {
    return resolvePresetMacrosInternal(content, context, 0, new Set());
}

/**
 * Resolves only macros backed by a character card. This is used while building
 * joined group cards so each member's own card references stay attached to that
 * member; session and preset macros are deliberately left for normal prompt
 * compilation.
 */
export function resolveCharacterCardMacros(content: string, character: SmileyCharacter) {
    return resolveCharacterCardMacrosInternal(content, character, 0, new Set());
}

function resolvePresetMacrosInternal(
    content: string,
    context: MacroContext,
    depth: number,
    resolvingKeys: Set<string>,
) {
    // Skip regex work entirely if no macros are present.
    if (!content || !content.includes("{{")) {
        return content;
    }

    const shouldTrim = /\{\{\s*trim\s*\}\}/.test(content);
    let resolved = content.replace(commentMacroPattern, "");

    resolved = resolved.replace(macroPattern, (match, key: string) => {
        const normalizedKey = key.trim();
        const macroValue = valueForMacro(normalizedKey, context);

        if (!macroValue) {
            return match;
        }

        if (macroValue.recursive && resolvingKeys.has(normalizedKey)) {
            return match;
        }

        if (!macroValue.recursive || depth >= maxNestedMacroDepth) {
            return macroValue.value;
        }

        resolvingKeys.add(normalizedKey);
        const resolvedValue = resolvePresetMacrosInternal(
            macroValue.value,
            context,
            depth + 1,
            resolvingKeys,
        );
        resolvingKeys.delete(normalizedKey);

        return resolvedValue;
    });

    return shouldTrim ? resolved.trim() : resolved;
}

function resolveCharacterCardMacrosInternal(
    content: string,
    character: SmileyCharacter,
    depth: number,
    resolvingKeys: Set<string>,
): string {
    if (!content || !content.includes("{{")) {
        return content;
    }

    const resolved = content.replace(commentMacroPattern, "");

    return resolved.replace(macroPattern, (match, key: string) => {
        const normalizedKey = key.trim().toLowerCase();
        const macroValue = characterCardMacroValue(normalizedKey, character, [], false);

        if (!macroValue) {
            return match;
        }

        if (macroValue.recursive && resolvingKeys.has(normalizedKey)) {
            return match;
        }

        if (!macroValue.recursive || depth >= maxNestedMacroDepth) {
            return macroValue.value;
        }

        resolvingKeys.add(normalizedKey);
        const resolvedValue = resolveCharacterCardMacrosInternal(
            macroValue.value,
            character,
            depth + 1,
            resolvingKeys,
        );
        resolvingKeys.delete(normalizedKey);

        return resolvedValue;
    });
}

function valueForMacro(key: string, context: MacroContext): MacroValue | undefined {
    const outletName = outletMacroName(key);

    if (outletName !== undefined) {
        return { recursive: true, value: context.outlets?.render(outletName) ?? "" };
    }

    const characterValue = characterCardMacroValue(
        key,
        context.character,
        context.messages,
    );

    if (characterValue) {
        return characterValue;
    }

    switch (key) {
        // Persona fields
        case "user":
        case "persona_name":
            return { recursive: true, value: context.personaName };
        case "persona":
        case "persona_description":
            return { recursive: true, value: context.personaDescription };
        case "status":
        case "user_status":
            return { value: context.userStatus };

        // Conversation history and message lookups. These are intentionally not
        // recursively expanded so chat content cannot accidentally invoke macros.
        case "chat_history":
            return { value: chatHistory(context.messages, context) };
        case "last message":
        case "last_message":
        case "lastMessage":
            return { value: lastMessage(context.messages) };
        case "last user message":
        case "last_user_message":
        case "lastUserMessage":
            return { value: lastUserMessage(context.messages) };
        case "last char message":
        case "last_char_message":
        case "lastCharMessage":
            return { value: lastCharacterMessage(context.messages) };
        case "message count":
        case "message_count":
            return { value: String(context.messages.length) };

        // Runtime/session values
        case "date":
            return { value: formatDate() };
        case "time":
            return { value: formatShortTime() };
        case "datetime":
            return { value: formatDateTime() };
        case "mode":
            return { value: context.mode };

        // Formatting/control macros
        case "newline":
            return { value: "\n" };
        case "trim":
            return { value: "" };
        default:
            return pluginMacroValue(key, context);
    }
}

function characterCardMacroValue(
    key: string,
    character: SmileyCharacter,
    messages: Message[] = [],
    includeFirstMessageFallback = true,
): MacroValue | undefined {
    switch (key) {
        case "char":
            return { recursive: true, value: character.data.name };
        case "char_description":
            return { recursive: true, value: character.data.description };
        case "char_personality":
        case "personality":
            return { recursive: true, value: character.data.personality };
        case "tagline":
            return { recursive: true, value: getCharacterTagline(character) };
        case "scenario":
            return { recursive: true, value: character.data.scenario };
        case "char_first_message":
            return character.data.first_mes
                ? { recursive: true, value: character.data.first_mes }
                : includeFirstMessageFallback
                  ? { value: firstCharacterMessage(messages) }
                  : undefined;
        case "char_message_examples":
        case "message_examples":
        case "mes_example":
            return { recursive: true, value: character.data.mes_example };
        case "char_system_prompt":
        case "system_prompt":
            return { recursive: true, value: character.data.system_prompt };
        case "char_post_history_instructions":
        case "post_history_instructions":
            return { recursive: true, value: character.data.post_history_instructions };
        case "character_book":
        case "char_lore":
            return { recursive: true, value: formatCharacterBook(character) };
        default:
            return undefined;
    }
}

function outletMacroName(key: string) {
    const match = /^outlet::(.+)$/i.exec(key.trim());
    return match ? match[1].trim() : undefined;
}

function pluginMacroValue(key: string, context: MacroContext) {
    const value = getPluginMacroValue(key, context);
    return typeof value === "string" ? { recursive: true, value } : undefined;
}

function chatHistory(messages: Message[], context: MacroContext) {
    return messages
        .map((message) =>
            messageTextForHistory(message, context, getMessageContent(message)),
        )
        .join("\n");
}

// Formats enabled character-book entries for prompt insertion macros.
export function formatCharacterBook(character: SmileyCharacter) {
    const book = character.data.character_book;

    if (!book) {
        return "";
    }

    const entries = book.entries
        .filter((entry) => entry.enabled)
        .map((entry) => {
            const keys = entry.keys.length ? `Keys: ${entry.keys.join(", ")}` : "";
            const secondaryKeys = entry.secondary_keys?.length
                ? `Secondary keys: ${entry.secondary_keys.join(", ")}`
                : "";
            const name = entry.name ? `Name: ${entry.name}` : "";

            return [name, keys, secondaryKeys, entry.content]
                .filter((part) => part.trim().length > 0)
                .join("\n");
        })
        .filter((entry) => entry.trim().length > 0);

    if (entries.length === 0) {
        return "";
    }

    return [
        book.name ? `Book: ${book.name}` : "",
        book.description ? `Description: ${book.description}` : "",
        entries.join("\n\n"),
    ]
        .filter((part) => part.trim().length > 0)
        .join("\n\n");
}

function firstCharacterMessage(messages: Message[]) {
    const message = messages.find((item) => item.role === "character");
    return message ? getMessageContent(message) : "";
}

function lastMessage(messages: Message[]) {
    const message = messages[messages.length - 1];
    return message ? getMessageContent(message) : "";
}

function lastUserMessage(messages: Message[]) {
    const message = findLastMessageByRole(messages, "user");
    return message ? getMessageContent(message) : "";
}

function lastCharacterMessage(messages: Message[]) {
    const message = findLastMessageByRole(messages, "character");
    return message ? getMessageContent(message) : "";
}

function findLastMessageByRole(messages: Message[], role: Message["role"]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === role) {
            return messages[index];
        }
    }

    return undefined;
}
