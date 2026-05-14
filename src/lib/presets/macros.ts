import type { ChatMode, Message, SmileyCharacter, UserStatus } from "../../types";
import { formatDate, formatDateTime, formatShortTime } from "../common/time";
import { getCharacterTagline } from "../characters/normalize";
import { getMessageContent } from "../messages";
import { getPluginMacroValue } from "../plugins/registry";

export type MacroContext = {
    character: SmileyCharacter;
    messages: Message[];
    mode: ChatMode;
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

function resolvePresetMacrosInternal(
    content: string,
    context: MacroContext,
    depth: number,
    resolvingKeys: Set<string>,
) {
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

function valueForMacro(key: string, context: MacroContext): MacroValue | undefined {
    switch (key) {
        // Character card fields
        case "char":
            return { recursive: true, value: context.character.data.name };
        case "char_description":
            return { recursive: true, value: context.character.data.description };
        case "char_personality":
        case "personality":
            return { recursive: true, value: context.character.data.personality };
        case "tagline":
            return { recursive: true, value: getCharacterTagline(context.character) };
        case "scenario":
            return { recursive: true, value: context.character.data.scenario };
        case "char_first_message":
            return context.character.data.first_mes
                ? { recursive: true, value: context.character.data.first_mes }
                : { value: firstCharacterMessage(context.messages) };
        case "char_message_examples":
        case "message_examples":
        case "mes_example":
            return { recursive: true, value: context.character.data.mes_example };
        case "char_system_prompt":
        case "system_prompt":
            return { recursive: true, value: context.character.data.system_prompt };
        case "char_post_history_instructions":
        case "post_history_instructions":
            return {
                recursive: true,
                value: context.character.data.post_history_instructions,
            };
        case "character_book":
        case "char_lore":
            return { recursive: true, value: formatCharacterBook(context.character) };

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
            return { value: chatHistory(context.messages) };
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

function pluginMacroValue(key: string, context: MacroContext) {
    const value = getPluginMacroValue(key, context);
    return typeof value === "string" ? { recursive: true, value } : undefined;
}

function chatHistory(messages: Message[]) {
    return messages
        .map((message) => `${message.author}: ${getMessageContent(message)}`)
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
