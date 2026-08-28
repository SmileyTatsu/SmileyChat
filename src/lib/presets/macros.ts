import type { ChatMode, Message, SmileyCharacter, UserStatus } from "#frontend/types";

import { getCharacterTagline } from "../characters/normalize";
import { formatDate, formatDateTime, formatShortTime } from "../common/time";
import { getMessageContent } from "../messages";
import { getPluginMacroValue } from "../plugins/registry";
import { messageTextForHistory } from "./message-format";
import type { PromptOutletRegistry } from "../prompt/outlets";
import type { PromptGenerationContext } from "../prompt/types";

import type { PresetFormattingSettings } from "./types";

export type MacroContext = {
    character: SmileyCharacter;
    formatting?: PresetFormattingSettings;
    group?: {
        joinPrefix?: string;
        memberIds?: string[];
    };
    isTextCompletion?: boolean;
    messages: Message[];
    mode: ChatMode;
    generation?: PromptGenerationContext;
    metadata?: Record<string, unknown>;
    outlets?: PromptOutletRegistry;
    personaName: string;
    personaDescription: string;
    userStatus: UserStatus;
    worldInfoBefore?: string;
    worldInfoAfter?: string;
    anchorBefore?: string;
    anchorAfter?: string;
};

type MacroValue = {
    recursive?: boolean;
    value: string;
};

const commentMacroPattern = /\{\{\/\/[\s\S]*?\}\}/g;
const ifBlockPattern =
    /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
const unlessBlockPattern =
    /\{\{#unless\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/unless\}\}/g;
const macroPattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
const maxNestedMacroDepth = 8;

export function resolvePresetMacros(content: string, context: MacroContext) {
    return resolvePresetMacrosInternal(content, context, 0, new Set());
}

/** Render a SillyTavern-style Story String with Handlebars blocks and known macros. */
export function renderStoryString(content: string, context: MacroContext) {
    const source = content.replace(commentMacroPattern, "");
    const system =
        context.character.data.system_prompt?.trim() ||
        context.formatting?.systemPrompt?.trim() ||
        "";
    const examplesRaw = context.character.data.mes_example || "";
    const exampleSeparator = context.formatting?.exampleSeparator ?? "";
    const examples = context.formatting?.skipExamples
        ? ""
        : examplesRaw.replace(/<START>/gi, exampleSeparator);
    const rendered = renderStoryTemplate(source, {
        anchorBefore: context.anchorBefore ?? "",
        anchorAfter: context.anchorAfter ?? "",
        anchorTop: context.anchorBefore ?? "",
        anchorBottom: context.anchorAfter ?? "",
        char: context.character.data.name,
        description: context.character.data.description,
        personality: context.character.data.personality,
        scenario: context.character.data.scenario,
        system,
        persona: context.personaDescription,
        user: context.personaName,
        wiBefore: context.worldInfoBefore ?? "",
        loreBefore: context.worldInfoBefore ?? "",
        wiAfter: context.worldInfoAfter ?? "",
        loreAfter: context.worldInfoAfter ?? "",
        mesExamples: examples,
        mesExamplesRaw: examplesRaw,
        trim: "",
    });
    return resolvePresetMacros(rendered, context);
}

type StoryTemplateValue =
    | string
    | number
    | boolean
    | StoryTemplateValue[]
    | StoryTemplateData;
type StoryTemplateData = { [key: string]: StoryTemplateValue | undefined };
type StoryTemplateNode =
    | { type: "text"; value: string }
    | { type: "value"; value: string }
    | {
          type: "block";
          block: "if" | "unless" | "each";
          value: string;
          truthy: StoryTemplateNode[];
          falsy: StoryTemplateNode[];
      };

/**
 * CSP-safe subset of Handlebars used by SillyTavern Story Strings. Handlebars'
 * runtime compiler uses `new Function`, which production CSP intentionally
 * blocks. Story Strings are user editable, so they cannot be precompiled.
 */
function renderStoryTemplate(source: string, data: StoryTemplateData) {
    const root: StoryTemplateNode[] = [];
    const stack: Array<{
        node: Extract<StoryTemplateNode, { type: "block" }>;
        branch: "truthy" | "falsy";
    }> = [];
    const currentNodes = () => {
        const current = stack[stack.length - 1];
        return current ? current.node[current.branch] : root;
    };
    const tokenPattern = /\{\{([\s\S]*?)\}\}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(source))) {
        if (match.index > cursor) {
            currentNodes().push({
                type: "text",
                value: source.slice(cursor, match.index),
            });
        }
        cursor = tokenPattern.lastIndex;
        const token = match[1].trim();
        const blockMatch = /^#(if|unless|each)\s+(.+)$/.exec(token);
        if (blockMatch) {
            const node: Extract<StoryTemplateNode, { type: "block" }> = {
                type: "block",
                block: blockMatch[1] as "if" | "unless" | "each",
                value: blockMatch[2].trim(),
                truthy: [],
                falsy: [],
            };
            currentNodes().push(node);
            stack.push({ node, branch: "truthy" });
        } else if (token === "else" && stack.length) {
            stack[stack.length - 1].branch = "falsy";
        } else if (/^\/(if|unless|each)$/.test(token) && stack.length) {
            stack.pop();
        } else {
            currentNodes().push({ type: "value", value: token });
        }
    }
    if (cursor < source.length) {
        root.push({ type: "text", value: source.slice(cursor) });
    }

    return renderStoryNodes(root, data, undefined, undefined, undefined);
}

function renderStoryNodes(
    nodes: StoryTemplateNode[],
    data: StoryTemplateData,
    current: StoryTemplateValue | undefined,
    index: number | undefined,
    key: string | undefined,
): string {
    return nodes
        .map((node) => {
            if (node.type === "text") return node.value;
            if (node.type === "value") {
                const value = storyTemplateValue(node.value, data, current, index, key);
                return value === undefined ? `{{${node.value}}}` : String(value);
            }
            const value = storyTemplateValue(node.value, data, current, index, key);
            if (node.block === "each") {
                if (Array.isArray(value)) {
                    return value
                        .map((item, itemIndex) =>
                            renderStoryNodes(
                                node.truthy,
                                data,
                                item,
                                itemIndex,
                                String(itemIndex),
                            ),
                        )
                        .join("");
                }
                if (value && typeof value === "object") {
                    return Object.entries(value)
                        .map(([itemKey, item]) =>
                            renderStoryNodes(node.truthy, data, item, undefined, itemKey),
                        )
                        .join("");
                }
                return renderStoryNodes(node.falsy, data, current, index, key);
            }
            const truthy = Boolean(value) && (!Array.isArray(value) || value.length > 0);
            const includeTruthy = node.block === "if" ? truthy : !truthy;
            return renderStoryNodes(
                includeTruthy ? node.truthy : node.falsy,
                data,
                current,
                index,
                key,
            );
        })
        .join("");
}

function storyTemplateValue(
    expression: string,
    data: StoryTemplateData,
    current: StoryTemplateValue | undefined,
    index: number | undefined,
    key: string | undefined,
): StoryTemplateValue | undefined {
    if (expression === "this") return current;
    if (expression === "@index") return index;
    if (expression === "@key") return key;
    if (expression.includes(" ")) return undefined;
    const parts = expression.split(".");
    let value: unknown = parts[0] === "this" ? current : data[parts[0]];
    for (const part of parts.slice(1)) {
        if (!value || typeof value !== "object" || !(part in value)) return undefined;
        value = (value as Record<string, unknown>)[part];
    }
    return value as StoryTemplateValue | undefined;
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

function evaluateConditionals(
    content: string,
    evaluator: (key: string) => boolean,
): string {
    let result = content;
    let iterations = 0;

    while (
        (ifBlockPattern.test(result) || unlessBlockPattern.test(result)) &&
        iterations < maxNestedMacroDepth
    ) {
        iterations++;
        result = result
            .replace(
                ifBlockPattern,
                (_, key: string, thenBranch: string, elseBranch = "") =>
                    evaluator(key) ? thenBranch : elseBranch,
            )
            .replace(
                unlessBlockPattern,
                (_, key: string, thenBranch: string, elseBranch = "") =>
                    evaluator(key) ? elseBranch : thenBranch,
            );
    }

    return result;
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

    resolved = evaluateConditionals(resolved, (key) => {
        const val = valueForMacro(key.trim(), context);
        return Boolean(val?.value?.trim());
    });

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

    let resolved = content.replace(commentMacroPattern, "");

    resolved = evaluateConditionals(resolved, (key) => {
        const val = characterCardMacroValue(
            key.trim().toLowerCase(),
            character,
            [],
            false,
        );
        return Boolean(val?.value?.trim());
    });

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

    const lower = key.toLowerCase().replace(/[\s_-]+/g, "");

    // System prompt alias that checks formatting.systemPrompt fallback if character prompt is empty (text completion only)
    if (
        lower === "system" ||
        lower === "systemprompt" ||
        lower === "charsystemprompt" ||
        lower === "charprompt"
    ) {
        const val =
            context.character.data.system_prompt?.trim() ||
            (context.isTextCompletion
                ? context.formatting?.systemPrompt?.trim()
                : undefined);
        if (val) {
            return { recursive: true, value: val };
        }
    }

    const characterValue = characterCardMacroValue(
        key,
        context.character,
        context.messages,
    );

    if (characterValue) {
        return characterValue;
    }

    switch (lower) {
        // Persona fields
        case "user":
        case "personaname":
            return { recursive: true, value: context.personaName };
        case "persona":
        case "personadescription":
            return { recursive: true, value: context.personaDescription };
        case "status":
        case "userstatus":
            return { value: context.userStatus };

        // World info / Lore aliases
        case "wibefore":
        case "lorebefore":
            return { recursive: true, value: context.worldInfoBefore ?? "" };
        case "wiafter":
        case "loreafter":
            return { recursive: true, value: context.worldInfoAfter ?? "" };

        // Conversation history and message lookups. These are intentionally not
        // recursively expanded so chat content cannot accidentally invoke macros.
        case "chathistory":
            return { value: chatHistory(context.messages, context) };
        case "lastmessage":
            return { value: lastMessage(context.messages) };
        case "lastusermessage":
            return { value: lastUserMessage(context.messages) };
        case "lastcharmessage":
            return { value: lastCharacterMessage(context.messages) };
        case "messagecount":
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
    const lower = key.toLowerCase().replace(/[\s_-]+/g, "");

    switch (lower) {
        case "char":
            return { recursive: true, value: character.data.name };
        case "chardescription":
        case "description":
            return { recursive: true, value: character.data.description };
        case "charpersonality":
        case "personality":
            return { recursive: true, value: character.data.personality };
        case "tagline":
            return { recursive: true, value: getCharacterTagline(character) };
        case "scenario":
            return { recursive: true, value: character.data.scenario };
        case "charfirstmessage":
            return character.data.first_mes
                ? { recursive: true, value: character.data.first_mes }
                : includeFirstMessageFallback
                  ? { value: firstCharacterMessage(messages) }
                  : undefined;
        case "charmessageexamples":
        case "messageexamples":
        case "mesexamples":
        case "mesexample":
            return { recursive: true, value: character.data.mes_example };
        case "charsystemprompt":
        case "systemprompt":
        case "system":
        case "charprompt":
            return { recursive: true, value: character.data.system_prompt };
        case "charposthistoryinstructions":
        case "posthistoryinstructions":
            return { recursive: true, value: character.data.post_history_instructions };
        case "characterbook":
        case "charlore":
        case "wibefore":
        case "wiafter":
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
