import type { ChatMode, Message, SmileyCharacter, UserStatus } from "#frontend/types";

import { getCharacterTagline } from "../characters/normalize";
import type { ChatGenerationMessage } from "../connections/types";
import { messageContentToText } from "../connections/images";
import {
    getMessageAttachments,
    getMessageContent,
    getActiveSwipe,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "../messages";
import { dynamicPromptIds } from "./defaults";
import { formatCharacterBook, resolvePresetMacros } from "./macros";
import { messageAuthorForPrompt } from "./message-format";
import type { PresetPrompt, SmileyPreset } from "./types";
import type { AnchoredPromptMessage } from "../prompt/injections";
import { isMessageIncludedInPrompt } from "../prompt/message-utils";
import type { PromptOutletRegistry } from "../prompt/outlets";
import type { PromptGenerationContext } from "../prompt/types";

type CompilePresetContext = {
    character: SmileyCharacter;
    group?: {
        joinPrefix?: string;
        memberIds?: string[];
    };
    generation?: PromptGenerationContext;
    /**
     * Budget-selected turns inserted as chat history.
     * When omitted, `messages` is used for both macros and history insertion.
     */
    historyMessages?: Message[];
    metadata?: Record<string, unknown>;
    /**
     * Full session messages used for macro resolution
     * (`{{message_count}}`, `{{last_message}}`, plugins, etc.).
     */
    messages: Message[];
    mode: ChatMode;
    outlets?: PromptOutletRegistry;
    personaDescription: string;
    personaName: string;
    userStatus: UserStatus;
};

function historyMessagesForCompile(context: CompilePresetContext) {
    return context.historyMessages ?? context.messages;
}

function macroContextForCompile(context: CompilePresetContext) {
    return {
        character: context.character,
        generation: context.generation,
        group: context.group,
        metadata: context.metadata,
        messages: context.messages,
        mode: context.mode,
        outlets: context.outlets,
        personaDescription: context.personaDescription,
        personaName: context.personaName,
        userStatus: context.userStatus,
    };
}

export function compilePresetContext(
    preset: SmileyPreset | undefined,
    context: CompilePresetContext,
) {
    if (!preset) {
        return compileFallbackContext(context.character);
    }

    return compilePresetMessages(preset, context)
        .map(
            (message) =>
                `${message.role.toUpperCase()}: ${messageContentToText(message.content)}`,
        )
        .join("\n\n");
}

export function compilePresetMessages(
    preset: SmileyPreset | undefined,
    context: CompilePresetContext,
): ChatGenerationMessage[] {
    return compilePresetMessagesWithMetadata(preset, context).map((item) => item.message);
}

export function compilePresetMessagesWithMetadata(
    preset: SmileyPreset | undefined,
    context: CompilePresetContext,
): AnchoredPromptMessage[] {
    if (!preset) {
        return [
            {
                anchor: "after-character",
                message: {
                    role: "system",
                    content: compileFallbackContext(context.character),
                },
                source: "preset",
            },
            ...historyMessagesForCompile(context)
                .filter(isMessageIncludedInPrompt)
                .flatMap((message) => toAnchoredHistoryMessages(message, context)),
        ];
    }

    const promptById = new Map(preset.prompts.map((prompt) => [prompt.id, prompt]));
    const orderedPrompts = preset.promptOrder
        .filter((entry) => entry.enabled)
        .map((entry) => promptById.get(entry.promptId))
        .filter((prompt): prompt is PresetPrompt => Boolean(prompt));
    const chatHistoryPromptId = selectChatHistoryPromptId(orderedPrompts);
    const messages: AnchoredPromptMessage[] = [];
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
            messages.push(toAnchoredPromptMessage(prompt, content));
        }
    }

    return messages;
}

function contentForPrompt(
    promptId: string,
    promptContent: string,
    context: CompilePresetContext,
) {
    const rawContent = promptContent.trim()
        ? promptContent
        : emptyDynamicPromptContent(promptId, context);

    return resolvePresetMacros(rawContent, macroContextForCompile(context));
}

function emptyDynamicPromptContent(promptId: string, context: CompilePresetContext) {
    switch (promptId) {
        case dynamicPromptIds.character:
            return context.character.data.description;
        case dynamicPromptIds.characterPersonality:
            return context.character.data.personality;
        case dynamicPromptIds.personaDescription:
            return context.personaDescription;
        case dynamicPromptIds.scenario:
            return context.character.data.scenario;
        case dynamicPromptIds.chatExamples:
            return context.character.data.mes_example;
        case dynamicPromptIds.worldInfoBefore:
        case dynamicPromptIds.worldInfoAfter:
            return "";
        case dynamicPromptIds.chatHistory:
            return historyMessagesForCompile(context)
                .filter(isMessageIncludedInPrompt)
                .map((message) => messageTextForHistory(message, context))
                .join("\n");
        default:
            return "";
    }
}

function compileFallbackContext(character: SmileyCharacter) {
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
        return injectConversationMessages(
            historyMessagesForCompile(context),
            injectedPrompts,
            context,
        );
    }

    const macros = macroContextForCompile(context);
    const before = resolvePresetMacros(
        prompt.content.slice(0, match.index),
        macros,
    ).trim();
    const after = resolvePresetMacros(
        prompt.content.slice(match.index + match[0].length),
        macros,
    ).trim();
    const output: AnchoredPromptMessage[] = [];

    if (before) {
        output.push(toAnchoredPromptMessage(prompt, before));
    }

    output.push(
        ...injectConversationMessages(
            historyMessagesForCompile(context),
            injectedPrompts,
            context,
        ),
    );

    if (after) {
        output.push(toAnchoredPromptMessage(prompt, after));
    }

    return output;
}

function injectConversationMessages(
    sourceMessages: Message[],
    injectedPrompts: Array<{ prompt: PresetPrompt; content: string }>,
    context: CompilePresetContext,
) {
    const promptMessages = sourceMessages.filter(isMessageIncludedInPrompt);

    if (promptMessages.length === 0) {
        return injectedPrompts.map(({ prompt, content }) =>
            toAnchoredPromptMessage(prompt, content),
        );
    }

    const output: AnchoredPromptMessage[] = [];

    for (let index = 0; index < promptMessages.length; index += 1) {
        for (const injectedPrompt of injectedPrompts) {
            if (
                injectedPrompt.prompt.injectionPosition === "before" &&
                injectionTargetIndex(
                    promptMessages,
                    injectedPrompt.prompt.injectionDepth,
                ) === index
            ) {
                output.push(
                    toAnchoredPromptMessage(
                        injectedPrompt.prompt,
                        injectedPrompt.content,
                    ),
                );
            }
        }

        output.push(...toAnchoredHistoryMessages(promptMessages[index], context));

        for (const injectedPrompt of injectedPrompts) {
            if (
                injectedPrompt.prompt.injectionPosition === "after" &&
                injectionTargetIndex(
                    promptMessages,
                    injectedPrompt.prompt.injectionDepth,
                ) === index
            ) {
                output.push(
                    toAnchoredPromptMessage(
                        injectedPrompt.prompt,
                        injectedPrompt.content,
                    ),
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

function toAnchoredPromptMessage(
    prompt: PresetPrompt,
    content: string,
): AnchoredPromptMessage {
    return {
        anchor: prompt.anchor,
        message: toPromptMessage(prompt, content),
        promptId: prompt.id,
        source: "preset",
    };
}

function toGenerationMessage(
    message: Message,
    context: CompilePresetContext,
): ChatGenerationMessage {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: promptRoleForMessage(message),
        content: messageContentWithAttachments(message, context),
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
        // We still check message.toolCalls/toolResult for backwards compatibility with old chats
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
        ...(message.toolResult ? { toolResult: message.toolResult } : {}),
    };
}

function toAnchoredHistoryMessages(
    message: Message,
    context: CompilePresetContext,
): AnchoredPromptMessage[] {
    const activeSwipe = getActiveSwipe(message);
    const activities = activeSwipe?.toolActivities;
    const pendingContinuation = activeSwipe?.pendingToolContinuation;

    if (activities?.length || pendingContinuation?.toolCalls.length) {
        return [
            ...(activities?.length
                ? [
                      {
                          message: {
                              role: promptRoleForMessage(message),
                              content: "",
                              toolCalls: activities.map((activity) => activity.call),
                          },
                          messageId: message.id,
                          source: "history" as const,
                      },
                      ...activities.map((activity) => ({
                          message: {
                              role: "user" as const,
                              content: activity.result.content,
                              toolResult: activity.result,
                          },
                          messageId: message.id,
                          source: "history" as const,
                      })),
                  ]
                : []),
            pendingContinuation?.toolCalls.length
                ? {
                      message: {
                          role: "assistant" as const,
                          content: messageContentWithAttachments(message, context),
                          ...(getMessageReasoning(message)
                              ? { reasoning: getMessageReasoning(message) }
                              : {}),
                          ...(getMessageReasoningDetails(message) !== undefined
                              ? { reasoningDetails: getMessageReasoningDetails(message) }
                              : {}),
                          toolCalls: pendingContinuation.toolCalls,
                      },
                      messageId: message.id,
                      source: "history" as const,
                  }
                : {
                      message: toGenerationMessage(message, context),
                      messageId: message.id,
                      source: "history" as const,
                  },
        ];
    }

    return [
        {
            message: toGenerationMessage(message, context),
            messageId: message.id,
            source: "history" as const,
        },
    ];
}

function promptRoleForMessage(message: Message): ChatGenerationMessage["role"] {
    if (message.toolCalls?.length) {
        return "assistant";
    }

    if (message.toolResult) {
        return "user";
    }

    const metadataRole = message.metadata?.promptRole;

    if (
        metadataRole === "assistant" ||
        metadataRole === "user" ||
        metadataRole === "system"
    ) {
        return metadataRole;
    }

    return message.role === "user" ? "user" : "assistant";
}

function messageContentForPrompt(message: Message, context: CompilePresetContext) {
    if (message.toolCalls?.length || message.toolResult) {
        return getMessageContent(message);
    }

    return resolvePresetMacros(
        getMessageContent(message),
        macroContextForCompile(context),
    );
}

function messageTextForHistory(message: Message, context: CompilePresetContext) {
    return `${messageAuthorForPrompt(message, context.group)}${messageContentForPrompt(message, context)}`;
}

function messageContentWithAttachments(
    message: Message,
    context: CompilePresetContext,
): ChatGenerationMessage["content"] {
    const content = messageTextForGeneration(message, context);
    const attachments = getMessageAttachments(message);

    if (attachments.length === 0) {
        return content;
    }

    return [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments.map((attachment) =>
            attachment.type === "image"
                ? {
                      type: "image_url" as const,
                      image_url: { url: attachment.url },
                  }
                : {
                      type: "file" as const,
                      file: {
                          url: attachment.url,
                          ...(attachment.name ? { filename: attachment.name } : {}),
                          ...(attachment.mimeType
                              ? { mime_type: attachment.mimeType }
                              : {}),
                          ...(attachment.sizeBytes !== undefined
                              ? { size_bytes: attachment.sizeBytes }
                              : {}),
                      },
                  },
        ),
    ];
}

function messageTextForGeneration(message: Message, context: CompilePresetContext) {
    const content = messageContentForPrompt(message, context);

    if (message.toolCalls?.length || message.toolResult) {
        return content;
    }

    if (
        message.role !== "character" ||
        !message.authorCharacterId ||
        !context.group?.memberIds?.includes(message.authorCharacterId)
    ) {
        return content;
    }

    return `${messageAuthorForPrompt(message, context.group)}${content}`;
}
