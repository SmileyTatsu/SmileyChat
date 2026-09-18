import type { ChatMode, Message, SmileyCharacter, UserStatus } from "#frontend/types";

import { getCharacterTagline } from "../characters/normalize";
import { chatImageSourceIndex, type ChatGenerationMessage } from "../connections/types";
import { messageContentToText } from "../connections/images";
import {
    getMessageAttachments,
    getMessageContent,
    getActiveSwipe,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "../messages";
import { dynamicPromptIds } from "./defaults";
import { defaultStoryString } from "../instruct";
import { formatCharacterBook, renderStoryString, resolvePresetMacros } from "./macros";
import { messageTextForHistory as formatMessageTextForHistory } from "./message-format";
import type { PresetFormattingSettings, PresetPrompt, SmileyPreset } from "./types";
import type { AnchoredPromptMessage } from "../prompt/injections";
import { isMessageIncludedInPrompt } from "../prompt/message-utils";
import { resolvePhotoPlaceholders } from "../message-formatting/photo-placeholders";
import {
    formatActiveAttachmentDescription,
    formatAttachmentContextText,
    getActiveBinaryAttachmentIds,
} from "./sliding-media-window";
import type { PromptOutletRegistry } from "../prompt/outlets";
import type { PromptGenerationContext } from "../prompt/types";

type CompilePresetContext = {
    character: SmileyCharacter;
    group?: {
        joinPrefix?: string;
        memberIds?: string[];
    };
    generation?: PromptGenerationContext;
    formatting?: PresetFormattingSettings;
    isTextCompletion?: boolean;
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
    worldInfoBefore?: string;
    worldInfoAfter?: string;
    anchorBefore?: string;
    anchorAfter?: string;
};

function historyMessagesForCompile(context: CompilePresetContext) {
    return context.historyMessages ?? context.messages;
}

function macroContextForCompile(context: CompilePresetContext) {
    return {
        character: context.character,
        formatting: context.formatting,
        generation: context.generation,
        group: context.group,
        isTextCompletion: context.isTextCompletion,
        metadata: context.metadata,
        messages: context.messages,
        mode: context.mode,
        outlets: context.outlets,
        personaDescription: context.personaDescription,
        personaName: context.personaName,
        userStatus: context.userStatus,
        worldInfoBefore: context.worldInfoBefore,
        worldInfoAfter: context.worldInfoAfter,
        anchorBefore: context.anchorBefore,
        anchorAfter: context.anchorAfter,
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
    // An explicitly empty preset is intentional. In particular, do not let the
    // text-completion story-string fallback silently recreate prompt context.
    if (preset && preset.prompts.length === 0) {
        return [];
    }

    if (
        context.isTextCompletion &&
        context.formatting?.overridePresetPromptOrder !== true
    ) {
        return compileStoryStringMessagesWithMetadata(context);
    }

    const history = historyMessagesForCompile(context).filter(isMessageIncludedInPrompt);
    const activeBinaryAttachmentIds = getActiveBinaryAttachmentIds(history);

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
            ...history.flatMap((message) =>
                toAnchoredHistoryMessages(message, context, undefined, activeBinaryAttachmentIds),
            ),
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
            content: contentForPrompt(prompt, context).trim(),
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

        const content = contentForPrompt(prompt, context).trim();

        if (content) {
            messages.push(toAnchoredPromptMessage(prompt, content));
        }
    }

    return messages;
}

function compileStoryStringMessagesWithMetadata(
    context: CompilePresetContext,
): AnchoredPromptMessage[] {
    const macros = macroContextForCompile(context);
    const storyTemplate = context.formatting?.storyString || defaultStoryString;
    const resolvedStory = renderStoryString(storyTemplate, macros);
    const messages: AnchoredPromptMessage[] = [];

    if (resolvedStory) {
        messages.push({
            anchor: "after-character",
            message: {
                role: "system",
                content: resolvedStory,
                formattingKind: "story",
            },
            promptId: "story-context",
            source: "preset",
        });
    }

    // ST places examples and Chat Start between the Story String and visible
    // history. Raw blocks preserve template-owned separators for custom
    // text-completion formats without assigning them an artificial chat role.
    if (
        context.formatting?.instructTemplate === "custom" &&
        !context.formatting.skipExamples
    ) {
        const examples = context.character.data.mes_example?.trim();
        const referencesExamples = /\{\{\s*mesExamples(?:Raw)?\s*\}\}/i.test(
            storyTemplate,
        );
        if (examples && !referencesExamples) {
            const separator = context.formatting.exampleSeparator ?? "";
            const formattedExamples = resolvePresetMacros(examples, macros).replace(
                /<START>/gi,
                separator,
            );
            messages.push({
                anchor: "before-examples",
                message: {
                    role: "system",
                    content: /<START>/i.test(examples)
                        ? formattedExamples
                        : `${separator ? `${separator}\n` : ""}${formattedExamples}`,
                    formattingKind: "raw",
                },
                promptId: "dialogue-examples",
                source: "preset",
            });
        }
    }
    if (
        context.formatting?.instructTemplate === "custom" &&
        context.formatting.chatStartSeparator
    ) {
        messages.push({
            anchor: "before-history",
            message: {
                role: "system",
                content: context.formatting.chatStartSeparator,
                formattingKind: "raw",
            },
            promptId: "chat-start",
            source: "preset",
        });
    }

    const history = historyMessagesForCompile(context).filter(isMessageIncludedInPrompt);
    const activeBinaryAttachmentIds = getActiveBinaryAttachmentIds(history);
    messages.push(
        ...history.flatMap((msg) =>
            toAnchoredHistoryMessages(msg, context, "chatHistory", activeBinaryAttachmentIds),
        ),
    );

    return messages;
}

function contentForPrompt(prompt: PresetPrompt, context: CompilePresetContext) {
    const isMainSystemPrompt =
        prompt.systemPrompt ||
        prompt.id === "69994633-aef6-4892-85d6-a47ddb7d03d6" ||
        prompt.id === "main" ||
        prompt.title.toLowerCase().includes("assistant instructions");

    const rawContent = prompt.content.trim()
        ? prompt.content
        : isMainSystemPrompt &&
            context.isTextCompletion &&
            context.formatting?.systemPrompt?.trim()
          ? context.formatting.systemPrompt.trim()
          : emptyDynamicPromptContent(prompt.id, context);

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
                .map((message) => messageTextForGeneration(message, context))
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
            prompt.id,
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
            prompt.id,
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
    historyPromptId: string,
) {
    const promptMessages = sourceMessages.filter(isMessageIncludedInPrompt);

    if (promptMessages.length === 0) {
        return injectedPrompts.map(({ prompt, content }) =>
            toAnchoredPromptMessage(prompt, content),
        );
    }

    const placements = createInjectionPlacements(promptMessages, injectedPrompts);
    const activeBinaryAttachmentIds = getActiveBinaryAttachmentIds(promptMessages);
    const output: AnchoredPromptMessage[] = [];

    for (let index = 0; index < promptMessages.length; index += 1) {
        for (const injectedPrompt of placements[index].before) {
            output.push(
                toAnchoredPromptMessage(injectedPrompt.prompt, injectedPrompt.content),
            );
        }

        output.push(
            ...toAnchoredHistoryMessages(
                promptMessages[index],
                context,
                historyPromptId,
                activeBinaryAttachmentIds,
            ),
        );

        for (const injectedPrompt of placements[index].after) {
            output.push(
                toAnchoredPromptMessage(injectedPrompt.prompt, injectedPrompt.content),
            );
        }
    }

    return output;
}

type InjectedPresetPrompt = {
    prompt: PresetPrompt;
    content: string;
    order: number;
    requestedDepth: number;
};

function createInjectionPlacements(
    messages: Message[],
    injectedPrompts: Array<{ prompt: PresetPrompt; content: string }>,
) {
    const placements = messages.map(() => ({
        before: [] as InjectedPresetPrompt[],
        after: [] as InjectedPresetPrompt[],
    }));

    injectedPrompts.forEach((injectedPrompt, order) => {
        const requestedDepth = normalizedInjectionDepth(
            injectedPrompt.prompt.injectionDepth,
        );
        const targetIndex = Math.max(0, messages.length - 1 - requestedDepth);
        const placement = placements[targetIndex];
        const positionedPrompt = { ...injectedPrompt, order, requestedDepth };

        if (injectedPrompt.prompt.injectionPosition === "before") {
            placement.before.push(positionedPrompt);
        } else {
            placement.after.push(positionedPrompt);
        }
    });

    for (const placement of placements) {
        placement.before.sort(compareInjectedPresetPrompts);
        placement.after.sort(compareInjectedPresetPrompts);
    }

    return placements;
}

function normalizedInjectionDepth(depth: number) {
    return Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
}

function compareInjectedPresetPrompts(
    first: InjectedPresetPrompt,
    second: InjectedPresetPrompt,
) {
    return second.requestedDepth - first.requestedDepth || first.order - second.order;
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
    activeBinaryAttachmentIds?: Set<string>,
): ChatGenerationMessage {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: promptRoleForMessage(message),
        content: messageContentWithAttachments(message, context, activeBinaryAttachmentIds),
        speakerName: message.author,
        ...(promptRoleForMessage(message) === "assistant" &&
        firstAssistantMessageId(context.messages) === message.id
            ? { isFirstAssistantInChat: true }
            : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
        // We still check message.toolCalls/toolResult for backwards compatibility with old chats
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
        ...(message.toolResult ? { toolResult: message.toolResult } : {}),
    };
}

function firstAssistantMessageId(messages: Message[]) {
    return messages.find((message) => promptRoleForMessage(message) === "assistant")?.id;
}

function toAnchoredHistoryMessages(
    message: Message,
    context: CompilePresetContext,
    promptId?: string,
    activeBinaryAttachmentIds?: Set<string>,
): AnchoredPromptMessage[] {
    const activeSwipe = getActiveSwipe(message);
    const activities = activeSwipe?.toolActivities;
    const replayableActivities = activities?.filter(
        (activity) =>
            activity.result.suppressHistoryProtocol !== true &&
            activity.call.name !== "generate_image",
    );
    const pendingContinuation = activeSwipe?.pendingToolContinuation;
    const generatedImageContext = toGeneratedImageContextMessage(message, promptId);

    if (replayableActivities?.length || pendingContinuation?.toolCalls.length) {
        return [
            ...(replayableActivities?.length
                ? [
                      {
                          message: {
                              role: promptRoleForMessage(message),
                              content: "",
                              speakerName: message.author,
                              toolCalls: replayableActivities.map(
                                  (activity) => activity.call,
                              ),
                          },
                          messageId: message.id,
                          promptId,
                          source: "history" as const,
                      },
                      ...replayableActivities.map((activity) => ({
                          message: {
                              role: "user" as const,
                              content: activity.result.content,
                              speakerName: "System",
                              toolResult: activity.result,
                          },
                          messageId: message.id,
                          promptId,
                          source: "history" as const,
                      })),
                  ]
                : []),
            ...(generatedImageContext ? [generatedImageContext] : []),
            pendingContinuation?.toolCalls.length
                ? {
                      message: {
                          role: "assistant" as const,
                          content: messageContentWithAttachments(
                              message,
                              context,
                              activeBinaryAttachmentIds,
                          ),
                          speakerName: message.author,
                          ...(getMessageReasoning(message)
                              ? { reasoning: getMessageReasoning(message) }
                              : {}),
                          ...(getMessageReasoningDetails(message) !== undefined
                              ? { reasoningDetails: getMessageReasoningDetails(message) }
                              : {}),
                          toolCalls: pendingContinuation.toolCalls,
                      },
                      messageId: message.id,
                      promptId,
                      source: "history" as const,
                  }
                : {
                      message: toGenerationMessage(message, context, activeBinaryAttachmentIds),
                      messageId: message.id,
                      promptId,
                      source: "history" as const,
                  },
        ];
    }

    return [
        {
            message: toGenerationMessage(message, context, activeBinaryAttachmentIds),
            messageId: message.id,
            promptId,
            source: "history" as const,
        },
        ...(generatedImageContext ? [generatedImageContext] : []),
    ];
}

function generatedImageContextsForMessage(message: Message) {
    const hasImageAttachment = getMessageAttachments(message).some(
        (attachment) => attachment.type === "image",
    );

    return (
        getActiveSwipe(message)
            ?.toolActivities?.filter(
                (activity) =>
                    Boolean(activity.result.imageContext?.trim()) ||
                    (activity.result.name === "generate_image" &&
                        activity.result.isError !== true &&
                        hasImageAttachment),
            )
            .map(
                (activity) =>
                    activity.result.imageContext?.trim() ||
                    "Generated image; detailed historical tags are unavailable.",
            ) ?? []
    );
}

function toGeneratedImageContextMessage(
    message: Message,
    promptId?: string,
): AnchoredPromptMessage | undefined {
    const contexts = generatedImageContextsForMessage(message);

    if (contexts.length === 0) {
        return undefined;
    }

    return {
        message: {
            role: "system",
            content: [
                "Internal visual continuity note. Do not quote or reproduce this note.",
                "A previous generate_image tool call produced an image described by:",
                ...contexts,
                "This records an existing image only. It does not generate a new image.",
                "If the user requests another image, use the generate_image tool; never answer with this note.",
            ].join("\n"),
        },
        messageId: message.id,
        promptId,
        source: "history",
    };
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

function messageContentWithAttachments(
    message: Message,
    context: CompilePresetContext,
    activeBinaryAttachmentIds?: Set<string>,
): ChatGenerationMessage["content"] {
    const content = messageTextForGeneration(message, context);
    const attachments = getMessageAttachments(message);
    const hasGeneratedImage = generatedImageContextsForMessage(message).length > 0;
    const resolved = resolvePhotoPlaceholders(content, attachments);

    if (attachments.length === 0) {
        return resolved.hasMarkers
            ? resolved.segments
                  .filter((segment) => segment.type === "text")
                  .map((segment) => segment.text)
                  .join("")
            : content;
    }

    const binaryAttachmentIds =
        activeBinaryAttachmentIds ??
        getActiveBinaryAttachmentIds(historyMessagesForCompile(context));

    const allowedAttachments = attachments.filter(
        (attachment) => !(attachment.type === "image" && hasGeneratedImage),
    );
    if (resolved.hasMarkers) {
        const parts: Exclude<ChatGenerationMessage["content"], string> = [];

        for (const segment of resolved.segments) {
            if (segment.type === "text") {
                if (segment.text) parts.push({ type: "text", text: segment.text });
                continue;
            }

            if (
                segment.type === "photo" &&
                allowedAttachments.some(
                    (attachment) => attachment.id === segment.attachment.id,
                )
            ) {
                const isBinary = binaryAttachmentIds.has(segment.attachment.id);
                if (isBinary) {
                    const desc = formatActiveAttachmentDescription(segment.attachment);
                    if (desc) {
                        parts.push({ type: "text", text: desc });
                    }
                    parts.push({
                        type: "image_url",
                        image_url: { url: segment.attachment.url },
                        [chatImageSourceIndex]: segment.imageIndex,
                    });
                } else {
                    parts.push({
                        type: "text",
                        text: formatAttachmentContextText(segment.attachment),
                    });
                }
            }
            // Missing markers are intentionally omitted from provider prompts.
        }

        for (const attachment of allowedAttachments) {
            if (
                attachment.type === "image" &&
                resolved.placedAttachmentIds.has(attachment.id)
            ) {
                continue;
            }
            parts.push(
                ...attachmentToContentParts(
                    attachment,
                    allowedAttachments,
                    binaryAttachmentIds,
                ),
            );
        }

        return simplifyContentParts(parts);
    }

    const attachmentParts = allowedAttachments.flatMap((attachment) => {
        return attachmentToContentParts(
            attachment,
            allowedAttachments,
            binaryAttachmentIds,
        );
    });

    if (attachmentParts.length === 0) {
        return content;
    }

    const parts = [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachmentParts,
    ];

    return simplifyContentParts(parts);
}

function attachmentToContentParts(
    attachment: ReturnType<typeof getMessageAttachments>[number],
    attachments: ReturnType<typeof getMessageAttachments>,
    binaryAttachmentIds: Set<string>,
): Exclude<ChatGenerationMessage["content"], string> {
    const isBinary = binaryAttachmentIds.has(attachment.id);

    if (!isBinary) {
        return [{ type: "text", text: formatAttachmentContextText(attachment) }];
    }

    const parts: Exclude<ChatGenerationMessage["content"], string> = [];
    const desc = formatActiveAttachmentDescription(attachment);
    if (desc) {
        parts.push({ type: "text", text: desc });
    }

    if (attachment.type === "image") {
        const images = attachments.filter((item) => item.type === "image");
        parts.push({
            type: "image_url" as const,
            image_url: { url: attachment.url },
            [chatImageSourceIndex]: images.findIndex((item) => item.id === attachment.id),
        });
    } else {
        parts.push({
            type: "file" as const,
            file: {
                url: attachment.url,
                ...(attachment.name ? { filename: attachment.name } : {}),
                ...(attachment.mimeType ? { mime_type: attachment.mimeType } : {}),
                ...(attachment.sizeBytes !== undefined
                    ? { size_bytes: attachment.sizeBytes }
                    : {}),
            },
        });
    }

    return parts;
}

function simplifyContentParts(
    parts: Exclude<ChatGenerationMessage["content"], string>,
): ChatGenerationMessage["content"] {
    if (parts.length === 0) return "";
    const isAllText = parts.every((part) => part.type === "text");
    if (isAllText) {
        return parts
            .map((part) => (part as { type: "text"; text: string }).text)
            .filter(Boolean)
            .join("\n");
    }
    return parts;
}

function messageTextForGeneration(message: Message, context: CompilePresetContext) {
    const content = messageContentForPrompt(message, context);

    if (message.toolCalls?.length || message.toolResult) {
        return content;
    }

    return formatMessageTextForHistory(message, context, content);
}
