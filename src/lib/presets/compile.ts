import type { ChatMode, Message, ScyllaCharacter, UserStatus } from "#frontend/types";

import { getCharacterTagline } from "../characters/normalize";
import type { ChatGenerationMessage } from "../connections/types";
import {
    getMessageContent,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "../messages";
import { dynamicPromptIds } from "./defaults";
import { formatCharacterBook, resolvePresetMacros } from "./macros";
import type { PresetPrompt, ScyllaPreset } from "./types";

type CompilePresetContext = {
    character: ScyllaCharacter;
    messages: Message[];
    mode: ChatMode;
    personaDescription: string;
    personaName: string;
    userStatus: UserStatus;
};

export function compilePresetContext(
    preset: ScyllaPreset | undefined,
    context: CompilePresetContext,
) {
    if (!preset) {
        return compileFallbackContext(context.character);
    }

    return compilePresetMessages(preset, context)
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n\n");
}

export function compilePresetMessages(
    preset: ScyllaPreset | undefined,
    context: CompilePresetContext,
): ChatGenerationMessage[] {
    if (!preset) {
        return [
            {
                role: "system",
                content: compileFallbackContext(context.character),
            },
            ...context.messages.map((message) => toGenerationMessage(message, context)),
        ];
    }

    const promptById = new Map(preset.prompts.map((prompt) => [prompt.id, prompt]));
    const orderedPrompts = preset.promptOrder
        .filter((entry) => entry.enabled)
        .map((entry) => promptById.get(entry.promptId))
        .filter((prompt): prompt is PresetPrompt => Boolean(prompt));
    const chatHistoryPromptId = selectChatHistoryPromptId(orderedPrompts);
    const messages: ChatGenerationMessage[] = [];
    const injectedPrompts = orderedPrompts
        .filter((prompt) => isInjectedPrompt(prompt, chatHistoryPromptId))
        .map((prompt) => ({
            prompt,
            content: contentForPrompt(prompt.id, prompt.content, context).trim(),
        }))
        .filter((item) => Boolean(item.content));

    for (const prompt of orderedPrompts) {
        if (isInjectedPrompt(prompt, chatHistoryPromptId)) {
            continue;
        }

        if (isChatHistoryPrompt(prompt, chatHistoryPromptId)) {
            messages.push(...injectChatHistoryPrompt(prompt, context, injectedPrompts));
            continue;
        }

        const content = contentForPrompt(prompt.id, prompt.content, context).trim();

        if (content) {
            messages.push(toPromptMessage(prompt, content));
        }
    }

    return messages;
}

function contentForPrompt(
    promptId: string,
    promptContent: string,
    context: CompilePresetContext,
) {
    const resolvedContent = resolvePresetMacros(promptContent, context);

    if (promptId === dynamicPromptIds.character) {
        const fallback = [
            `Character: ${context.character.data.name}`,
            `Short description: ${getCharacterTagline(context.character)}`,
            `Description: ${context.character.data.description}`,
            `Personality: ${context.character.data.personality}`,
            `System prompt: ${context.character.data.system_prompt}`,
            `First message: ${context.character.data.first_mes}`,
            `Message examples: ${context.character.data.mes_example}`,
            `Character book: ${resolvePresetMacros("{{character_book}}", context)}`,
        ].join("\n");

        return resolvedContent.trim() || fallback;
    }

    if (promptId === dynamicPromptIds.scenario) {
        return (
            resolvedContent.trim() ||
            [
                `Scenario: ${context.character.data.scenario}`,
                `Post-history instructions: ${context.character.data.post_history_instructions}`,
            ].join("\n")
        );
    }

    if (promptId === dynamicPromptIds.chatHistory) {
        return (
            resolvedContent.trim() ||
            context.messages
                .map(
                    (message) =>
                        `${message.author}: ${messageContentForPrompt(message, context)}`,
                )
                .join("\n")
        );
    }

    return resolvedContent;
}

function compileFallbackContext(character: ScyllaCharacter) {
    return [
        `Character: ${character.data.name}`,
        `Short description: ${getCharacterTagline(character)}`,
        `Description: ${character.data.description}`,
        `Personality: ${character.data.personality}`,
        `Scenario: ${character.data.scenario}`,
        `First message: ${character.data.first_mes}`,
        `Message examples: ${character.data.mes_example}`,
        `Character book: ${formatCharacterBook(character)}`,
        `System prompt: ${character.data.system_prompt}`,
        `Post-history instructions: ${character.data.post_history_instructions}`,
        "Mode: visual only",
    ].join("\n");
}

function selectChatHistoryPromptId(prompts: PresetPrompt[]) {
    const macroPrompt = prompts.find((prompt) => hasChatHistoryMacro(prompt.content));

    if (macroPrompt) {
        return macroPrompt.id;
    }

    return prompts.find((prompt) => prompt.id === dynamicPromptIds.chatHistory)?.id ?? "";
}

function isChatHistoryPrompt(prompt: PresetPrompt, chatHistoryPromptId: string) {
    return Boolean(chatHistoryPromptId) && prompt.id === chatHistoryPromptId;
}

function isInjectedPrompt(prompt: PresetPrompt, chatHistoryPromptId: string) {
    return (
        prompt.injectionPosition !== "none" &&
        !isChatHistoryPrompt(prompt, chatHistoryPromptId)
    );
}

function hasChatHistoryMacro(content: string) {
    return chatHistoryMacroPattern().test(content);
}

function chatHistoryMacroPattern() {
    return /\{\{\s*chat_history\s*\}\}/i;
}

function injectChatHistoryPrompt(
    prompt: PresetPrompt,
    context: CompilePresetContext,
    injectedPrompts: Array<{ prompt: PresetPrompt; content: string }>,
) {
    const match = chatHistoryMacroPattern().exec(prompt.content);

    if (!match) {
        return injectConversationMessages(context.messages, injectedPrompts, context);
    }

    const before = resolvePresetMacros(
        prompt.content.slice(0, match.index),
        context,
    ).trim();
    const after = resolvePresetMacros(
        prompt.content.slice(match.index + match[0].length),
        context,
    ).trim();
    const output: ChatGenerationMessage[] = [];

    if (before) {
        output.push(toPromptMessage(prompt, before));
    }

    output.push(
        ...injectConversationMessages(context.messages, injectedPrompts, context),
    );

    if (after) {
        output.push(toPromptMessage(prompt, after));
    }

    return output;
}

function injectConversationMessages(
    sourceMessages: Message[],
    injectedPrompts: Array<{ prompt: PresetPrompt; content: string }>,
    context: CompilePresetContext,
) {
    if (sourceMessages.length === 0) {
        return injectedPrompts.map(({ prompt, content }) =>
            toPromptMessage(prompt, content),
        );
    }

    const output: ChatGenerationMessage[] = [];

    for (let index = 0; index < sourceMessages.length; index += 1) {
        for (const injectedPrompt of injectedPrompts) {
            if (
                injectedPrompt.prompt.injectionPosition === "before" &&
                injectionTargetIndex(
                    sourceMessages,
                    injectedPrompt.prompt.injectionDepth,
                ) === index
            ) {
                output.push(
                    toPromptMessage(injectedPrompt.prompt, injectedPrompt.content),
                );
            }
        }

        output.push(toGenerationMessage(sourceMessages[index], context));

        for (const injectedPrompt of injectedPrompts) {
            if (
                injectedPrompt.prompt.injectionPosition === "after" &&
                injectionTargetIndex(
                    sourceMessages,
                    injectedPrompt.prompt.injectionDepth,
                ) === index
            ) {
                output.push(
                    toPromptMessage(injectedPrompt.prompt, injectedPrompt.content),
                );
            }
        }
    }

    return output;
}

function injectionTargetIndex(messages: Message[], depth: number) {
    const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
    return Math.max(0, messages.length - 1 - safeDepth);
}

function toPromptMessage(prompt: PresetPrompt, content: string): ChatGenerationMessage {
    return {
        role: prompt.role,
        content,
    };
}

function toGenerationMessage(
    message: Message,
    context: CompilePresetContext,
): ChatGenerationMessage {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: message.role === "user" ? "user" : "assistant",
        content: messageContentForPrompt(message, context),
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
    };
}

function messageContentForPrompt(message: Message, context: CompilePresetContext) {
    return resolvePresetMacros(getMessageContent(message), context);
}
