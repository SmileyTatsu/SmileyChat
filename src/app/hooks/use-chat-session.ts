import { useEffect, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import { clampInteger, clampNumber } from "#frontend/lib/common/math";
import type { ConnectionSettings } from "#frontend/lib/connections/config";
import {
    createCharacterErrorMessage,
    createCharacterMessage,
    createUserMessage,
    getMessageAttachments,
    updateActiveSwipeContent,
} from "#frontend/lib/messages";
import {
    setStreamingGeneratedImageCount,
    setStreamingMessageContent,
    setStreamingMessageReasoning,
} from "#frontend/lib/streaming-message-drafts";
import { isGroupChat } from "#frontend/lib/chats/normalize";
import type { LorebookCollection } from "#frontend/lib/lorebooks/types";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { PresetCollection } from "#frontend/lib/presets/types";
import type {
    ChatMode,
    ChatAttachment,
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import { useChatGenerationState } from "./use-chat-generation-state";
import {
    deleteLocalChatAttachments,
    generatedImageUrlsToLocalAttachments,
    uploadMessageAttachments,
} from "./chat-session-attachments";
import {
    eligibleGroupCharacters,
    promptCharacterForGeneration,
    selectGenerationCharacter,
} from "./use-group-chat-generation";
import { useMessageOperations } from "./use-message-operations";
import { usePromptGeneration } from "./use-prompt-generation";

type UseChatSessionOptions = {
    chat?: ChatSession;
    character: SmileyCharacter;
    connectionSettings: ConnectionSettings;
    groupCharacters?: SmileyCharacter[];
    lorebookCollection: LorebookCollection;
    mode: ChatMode;
    onChatChange: (chat: ChatSession) => void;
    persona: SmileyPersona;
    preferences: AppPreferences;
    presetCollection: PresetCollection;
    userStatus: UserStatus;
};

type SendMessageOptions = {
    autoTurnCount?: number;
    forcedCharacterId?: string;
    files?: File[];
    suppressAutoResponses?: boolean;
};

const emptyGenerationSuppressMs = 750;

export function useChatSession({
    chat,
    character,
    connectionSettings,
    groupCharacters = [],
    lorebookCollection,
    mode,
    onChatChange,
    persona,
    preferences,
    presetCollection,
    userStatus,
}: UseChatSessionOptions) {
    const [chatError, setChatError] = useState("");
    const latestChatRef = useRef<ChatSession | undefined>(chat);
    const autoResponseTimerRef = useRef<number | undefined>(undefined);
    const suppressEmptyGenerationUntilRef = useRef<Record<string, number>>({});
    const {
        beginChatPending,
        beginGenerationController,
        endChatPending,
        endGenerationController,
        getActiveGeneration,
        isChatPending,
        pendingChatIds,
        pendingSwipeMessageIds,
    } = useChatGenerationState();
    const {
        applyInputMiddlewares,
        generateWithPreset,
        getDebugPayload: buildDebugPayload,
        resolveChatMacros,
    } = usePromptGeneration({
        character,
        connectionSettings,
        groupCharacters,
        latestChatRef,
        lorebookCollection,
        mode,
        persona,
        preferences,
        presetCollection,
        userStatus,
    });
    const {
        activateNextExistingSwipe,
        appendEmptySwipe,
        appendSwipe,
        commitStreamingDraft,
        currentOrSourceChat,
        deleteMessage,
        editMessage,
        injectMessage,
        previousSwipe,
        removeActiveSwipe,
        removeMessage,
        updateChatMessages,
        updateMessageAttachments,
        updateMessageContent,
    } = useMessageOperations({
        character,
        latestChatRef,
        onChatChange,
        persona,
        resolveChatMacros,
    });

    latestChatRef.current = latestChatValue(latestChatRef.current, chat);

    useEffect(() => {
        setChatError("");
        clearAutomaticResponseTimer();
    }, [chat?.id]);

    useEffect(
        () => () => {
            clearAutomaticResponseTimer();
        },
        [],
    );

    async function sendMessage(draft: string, files: File[] = []) {
        return sendMessageWithOptions(draft, { files });
    }

    async function forceGroupMemberResponse(characterId: string) {
        const sourceChat = latestChatRef.current;

        if (
            !sourceChat ||
            !isGroupChat(sourceChat) ||
            !groupCharacters.some((item) => item.id === characterId)
        ) {
            setChatError("That group member no longer has a saved character card.");
            return;
        }

        return sendMessageWithOptions("", {
            forcedCharacterId: characterId,
            suppressAutoResponses: true,
        });
    }

    async function sendMessageWithOptions(
        draft: string,
        options: SendMessageOptions = {},
    ) {
        const files = options.files ?? [];
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        if (
            (draft.trim() || files.length || options.forcedCharacterId) &&
            !options.autoTurnCount
        ) {
            clearAutomaticResponseTimer();
        }

        const sourceMessages = sourceChat.messages;
        const generationCharacter = selectGenerationCharacter({
            character,
            forcedCharacterId: options.forcedCharacterId,
            groupCharacters,
            messages: sourceMessages,
            sourceChat,
        });
        const text = await applyInputMiddlewares(
            resolveChatMacros(draft.trim(), sourceMessages, generationCharacter),
            sourceMessages,
            generationCharacter,
            mode,
            userStatus,
        );

        if (isChatPending(sourceChat.id)) {
            return;
        }

        const chatId = sourceChat.id;

        if (
            !text &&
            files.length === 0 &&
            performance.now() < (suppressEmptyGenerationUntilRef.current[chatId] ?? 0)
        ) {
            return;
        }

        let attachments: ChatAttachment[] = [];

        try {
            attachments = files.length
                ? await uploadMessageAttachments(chatId, files)
                : [];
        } catch (error) {
            setChatError(`Attachment upload failed: ${messageFromError(error)}`);
            return;
        }

        const userMessage =
            text || attachments.length
                ? createUserMessage(text, persona, attachments)
                : undefined;
        const nextMessages = userMessage
            ? [...sourceMessages, userMessage]
            : sourceMessages;
        const pendingChat = userMessage
            ? {
                  ...sourceChat,
                  messages: nextMessages,
                  updatedAt: new Date().toISOString(),
              }
            : sourceChat;

        if (userMessage) {
            updateChatMessages(nextMessages, sourceChat);
        }
        const streamingReply = preferences.chat.streaming
            ? createCharacterMessage(
                  generationCharacter.data.name,
                  "",
                  undefined,
                  generationCharacter,
              )
            : undefined;
        let streamedContent = "";
        let streamedReasoning = "";
        const streamedImages: string[] = [];
        setChatError("");
        beginChatPending(chatId);
        const abortController = beginGenerationController(chatId, {
            streamingMessageId: streamingReply?.id,
        });

        try {
            if (streamingReply) {
                updateChatMessages(
                    [...pendingChat.messages, streamingReply],
                    currentOrSourceChat(pendingChat),
                );
            }

            const result = await generateWithPreset(
                nextMessages,
                generationCharacter,
                mode,
                userStatus,
                connectionSettings,
                {
                    promptCharacter: promptCharacterForGeneration({
                        activeSpeaker: generationCharacter,
                        groupCharacters,
                        sourceChat,
                    }),
                    sourceChat: pendingChat,
                    stream: preferences.chat.streaming,
                    trigger: options.autoTurnCount ? "auto-group" : "send",
                    onToken: streamingReply
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedContent += token;
                              setStreamingMessageContent(
                                  streamingReply.id,
                                  streamedContent,
                              );
                          }
                        : undefined,
                    onReasoningToken: streamingReply
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedReasoning += token;
                              setStreamingMessageReasoning(
                                  streamingReply.id,
                                  streamedReasoning,
                              );
                          }
                        : undefined,
                    onImage: streamingReply
                        ? (url) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedImages.push(url);
                              setStreamingGeneratedImageCount(
                                  streamingReply.id,
                                  streamedImages.length,
                              );
                          }
                        : undefined,
                    signal: abortController.signal,
                },
            );

            if (abortController.signal.aborted) {
                return;
            }

            if (streamingReply) {
                const resultAttachments = await saveGeneratedImageAttachments(
                    chatId,
                    result.images?.length ? result.images : streamedImages,
                );
                updateMessageContent(
                    streamingReply.id,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                );
                if (resultAttachments.length) {
                    updateMessageAttachments(streamingReply.id, resultAttachments);
                }
                scheduleAutomaticGroupResponse({
                    autoTurnCount: options.autoTurnCount ?? 0,
                    chatId,
                    suppressAutoResponses: options.suppressAutoResponses === true,
                });
            } else {
                const resultAttachments = await saveGeneratedImageAttachments(
                    chatId,
                    result.images ?? [],
                );
                const reply = withMessageReasoning(
                    createCharacterMessage(
                        generationCharacter.data.name,
                        result.message,
                        resultAttachments,
                        generationCharacter,
                    ),
                    result.reasoning,
                    result.reasoningDetails,
                );

                updateChatMessages(
                    [...pendingChat.messages, reply],
                    currentOrSourceChat(pendingChat),
                );
                scheduleAutomaticGroupResponse({
                    autoTurnCount: options.autoTurnCount ?? 0,
                    chatId,
                    suppressAutoResponses: options.suppressAutoResponses === true,
                });
            }
        } catch (error) {
            if (isAbortError(error)) {
                cleanupEmptyAbortedGeneration(chatId);
                return;
            }

            const errorMessage = generationErrorMessage(error);
            const targetChat = currentOrSourceChat(pendingChat);
            const lastMessage = targetChat.messages[targetChat.messages.length - 1];

            if (
                preferences.chat.streaming &&
                lastMessage?.role === "character" &&
                lastMessage.author === generationCharacter.data.name
            ) {
                updateMessageContent(lastMessage.id, errorMessage, "error");
            } else {
                updateChatMessages(
                    [
                        ...pendingChat.messages,
                        createCharacterErrorMessage(
                            generationCharacter.data.name,
                            errorMessage,
                        ),
                    ],
                    targetChat,
                );
            }
            if (latestChatRef.current?.id === chatId) {
                setChatError(
                    "Generation failed. Swipe the failed response or send again to retry.",
                );
            }
        } finally {
            endGenerationController(chatId, abortController);
            endChatPending(chatId);
        }
    }

    async function nextSwipe(messageId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        if (isChatPending(sourceChat.id)) {
            return;
        }

        const targetMessage = sourceChat.messages.find(
            (message) => message.id === messageId,
        );

        if (!targetMessage) {
            return;
        }

        if (activateNextExistingSwipe(messageId, sourceChat)) {
            return;
        }

        if (targetMessage.role !== "character") {
            return;
        }

        const chatId = sourceChat.id;
        const targetIndex = sourceChat.messages.findIndex(
            (message) => message.id === messageId,
        );
        const historyBeforeTarget = sourceChat.messages.slice(
            0,
            Math.max(0, targetIndex),
        );
        const generationCharacter =
            groupCharacters.find((item) => item.id === targetMessage.authorCharacterId) ??
            selectGenerationCharacter({
                character,
                groupCharacters,
                messages: historyBeforeTarget,
                sourceChat,
            });

        setChatError("");
        beginChatPending(chatId, messageId);
        const abortController = beginGenerationController(chatId, {
            swipeMessageId: preferences.chat.streaming ? messageId : undefined,
        });
        let streamedContent = "";
        let streamedReasoning = "";
        const streamedImages: string[] = [];

        try {
            if (preferences.chat.streaming) {
                appendEmptySwipe(messageId, sourceChat);
            }

            const result = await generateWithPreset(
                historyBeforeTarget,
                generationCharacter,
                mode,
                userStatus,
                connectionSettings,
                {
                    promptCharacter: promptCharacterForGeneration({
                        activeSpeaker: generationCharacter,
                        groupCharacters,
                        sourceChat,
                    }),
                    sourceChat,
                    stream: preferences.chat.streaming,
                    targetMessageId: messageId,
                    trigger: "swipe",
                    onToken: preferences.chat.streaming
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedContent += token;
                              setStreamingMessageContent(messageId, streamedContent);
                          }
                        : undefined,
                    onReasoningToken: preferences.chat.streaming
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedReasoning += token;
                              setStreamingMessageReasoning(messageId, streamedReasoning);
                          }
                        : undefined,
                    onImage: preferences.chat.streaming
                        ? (url) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedImages.push(url);
                              setStreamingGeneratedImageCount(
                                  messageId,
                                  streamedImages.length,
                              );
                          }
                        : undefined,
                    signal: abortController.signal,
                },
            );

            if (abortController.signal.aborted) {
                return;
            }

            const targetChat = currentOrSourceChat(sourceChat);
            if (preferences.chat.streaming) {
                const resultAttachments = await saveGeneratedImageAttachments(
                    chatId,
                    result.images?.length ? result.images : streamedImages,
                );
                updateMessageContent(
                    messageId,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                );
                if (resultAttachments.length) {
                    updateMessageAttachments(messageId, resultAttachments);
                }
            } else {
                const resultAttachments = await saveGeneratedImageAttachments(
                    chatId,
                    result.images ?? [],
                );
                appendSwipe(
                    messageId,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                    targetChat,
                );
                if (resultAttachments.length) {
                    updateMessageAttachments(messageId, resultAttachments);
                }
            }
        } catch (error) {
            if (isAbortError(error)) {
                cleanupEmptyAbortedGeneration(chatId);
                return;
            }

            const targetChat = currentOrSourceChat(sourceChat);
            if (preferences.chat.streaming) {
                updateMessageContent(messageId, generationErrorMessage(error), "error");
            } else {
                appendSwipe(
                    messageId,
                    generationErrorMessage(error),
                    "error",
                    undefined,
                    undefined,
                    targetChat,
                );
            }
            if (latestChatRef.current?.id === chatId) {
                setChatError(
                    "Generation failed. Swipe the failed response again to retry.",
                );
            }
        } finally {
            endGenerationController(chatId, abortController);
            endChatPending(chatId);
        }
    }

    async function getDebugPayload() {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            throw new Error("No active chat is available for prompt debugging.");
        }

        const generationCharacter = selectGenerationCharacter({
            character,
            groupCharacters,
            messages: sourceChat.messages,
            sourceChat,
        });

        return buildDebugPayload(
            sourceChat.messages,
            generationCharacter,
            mode,
            userStatus,
            connectionSettings,
            {
                promptCharacter: promptCharacterForGeneration({
                    activeSpeaker: generationCharacter,
                    groupCharacters,
                    sourceChat,
                }),
                sourceChat,
                stream: preferences.chat.streaming,
                trigger: "send",
            },
        );
    }

    function stopGeneration() {
        const activeChatId = latestChatRef.current?.id;

        clearAutomaticResponseTimer();

        if (!activeChatId) {
            return;
        }

        const activeGeneration = getActiveGeneration(activeChatId);

        if (!activeGeneration) {
            return;
        }

        activeGeneration.controller.abort();
        suppressEmptyGenerationUntilRef.current = {
            ...suppressEmptyGenerationUntilRef.current,
            [activeChatId]: performance.now() + emptyGenerationSuppressMs,
        };
        cleanupEmptyAbortedGeneration(activeChatId, activeGeneration);
    }

    function scheduleAutomaticGroupResponse({
        autoTurnCount,
        chatId,
        suppressAutoResponses,
    }: {
        autoTurnCount: number;
        chatId: string;
        suppressAutoResponses: boolean;
    }) {
        if (suppressAutoResponses) {
            return;
        }

        const sourceChat = latestChatRef.current;

        if (!sourceChat || sourceChat.id !== chatId || !isGroupChat(sourceChat)) {
            return;
        }

        const autoResponses = sourceChat.group?.autoResponses;

        if (!autoResponses?.enabled) {
            return;
        }

        const maxTurns = clampInteger(autoResponses.maxTurns, 1, 8);

        if (autoTurnCount >= maxTurns) {
            return;
        }

        if (
            eligibleGroupCharacters({
                groupCharacters,
                messages: sourceChat.messages,
                sourceChat,
            }).length === 0
        ) {
            return;
        }

        const chance = clampNumber(autoResponses.chance, 0, 1);

        if (Math.random() >= chance) {
            return;
        }

        const delayMs = clampInteger(autoResponses.delayMs, 0, 10000);

        clearAutomaticResponseTimer();
        autoResponseTimerRef.current = window.setTimeout(() => {
            autoResponseTimerRef.current = undefined;

            if (latestChatRef.current?.id !== chatId || isChatPending(chatId)) {
                return;
            }

            void sendMessageWithOptions("", {
                autoTurnCount: autoTurnCount + 1,
            });
        }, delayMs);
    }

    function clearAutomaticResponseTimer() {
        if (!autoResponseTimerRef.current) {
            return;
        }

        window.clearTimeout(autoResponseTimerRef.current);
        autoResponseTimerRef.current = undefined;
    }

    async function saveGeneratedImageAttachments(chatId: string, urls: string[]) {
        if (urls.length === 0) {
            return [];
        }

        try {
            const result = await generatedImageUrlsToLocalAttachments(chatId, urls);

            if (result.failedCount > 0) {
                setChatError(
                    `${result.failedCount} generated ${result.failedCount === 1 ? "image" : "images"} could not be saved locally.`,
                );
            }

            return result.attachments;
        } catch (error) {
            setChatError(
                `Generated image could not be saved locally: ${messageFromError(error)}`,
            );
            return [];
        }
    }

    function cleanupEmptyAbortedGeneration(
        chatId: string,
        activeGeneration = getActiveGeneration(chatId),
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat || sourceChat.id !== chatId || !activeGeneration) {
            return;
        }

        if (activeGeneration.streamingMessageId) {
            const message = sourceChat.messages.find(
                (item) => item.id === activeGeneration.streamingMessageId,
            );

            if (message && commitStreamingDraft(message.id, sourceChat)) {
                return;
            }

            if (message && isActiveMessageSwipeEmpty(message)) {
                removeMessage(message.id, sourceChat);
            }
        }

        if (activeGeneration.swipeMessageId) {
            const message = sourceChat.messages.find(
                (item) => item.id === activeGeneration.swipeMessageId,
            );

            if (message && commitStreamingDraft(message.id, sourceChat)) {
                return;
            }

            if (
                message &&
                message.swipes.length > 1 &&
                isActiveMessageSwipeEmpty(message)
            ) {
                removeActiveSwipe(message.id, sourceChat);
            }
        }
    }

    async function removeMessageAttachment(messageId: string, attachmentId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        const message = sourceChat.messages.find((item) => item.id === messageId);

        if (!message) {
            return;
        }

        const attachments = getMessageAttachments(message);
        const removed = attachments.filter(
            (attachment) => attachment.id === attachmentId,
        );
        const remaining = attachments.filter(
            (attachment) => attachment.id !== attachmentId,
        );

        if (removed.length === 0) {
            return;
        }

        updateMessageAttachments(messageId, remaining);
        await deleteLocalChatAttachments(sourceChat.id, removed);
    }

    async function removeAllMessageAttachments(messageId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        const message = sourceChat.messages.find((item) => item.id === messageId);

        if (!message) {
            return;
        }

        const attachments = getMessageAttachments(message);

        if (attachments.length === 0) {
            return;
        }

        updateMessageAttachments(messageId, []);
        await deleteLocalChatAttachments(sourceChat.id, attachments);
    }

    const activeChatId = chat?.id ?? "";

    return {
        chatError,
        deleteMessage,
        editMessage,
        getDebugPayload,
        isSending: activeChatId ? pendingChatIds.includes(activeChatId) : false,
        injectMessage,
        messages: chat?.messages ?? [],
        nextSwipe,
        pendingSwipeMessageId: activeChatId
            ? (pendingSwipeMessageIds[activeChatId] ?? "")
            : "",
        previousSwipe,
        removeActiveSwipe,
        removeAllMessageAttachments,
        removeMessageAttachment,
        forceGroupMemberResponse,
        sendMessage,
        stopGeneration,
    };
}

function generationErrorMessage(error: unknown) {
    return `Generation failed: ${messageFromError(error)}`;
}

function isAbortError(error: unknown) {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

function isActiveMessageSwipeEmpty(message: Message) {
    const swipe = message.swipes[message.activeSwipeIndex] ?? message.swipes[0];

    return (
        !swipe?.content?.trim() &&
        !swipe?.reasoning?.trim() &&
        (swipe?.attachments?.length ?? 0) === 0
    );
}

function withMessageReasoning(
    message: Message,
    reasoning?: string,
    reasoningDetails?: unknown,
) {
    if (!reasoning && reasoningDetails === undefined) {
        return message;
    }

    return updateActiveSwipeContent(
        message,
        message.swipes[message.activeSwipeIndex]?.content ?? "",
        undefined,
        reasoning,
        reasoningDetails,
    );
}

function latestChatValue(
    current: ChatSession | undefined,
    next: ChatSession | undefined,
) {
    if (!current || !next || current.id !== next.id) {
        return next;
    }

    return next.updatedAt >= current.updatedAt ? next : current;
}
