import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { uploadChatAttachments } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { materializeChatGenerationMessageImages } from "#frontend/lib/connections/images";
import type { ConnectionSettings } from "#frontend/lib/connections/config";
import { getAdapterForSettings } from "#frontend/lib/connections/registry";
import {
    appendMessageSwipe,
    createCharacterErrorMessage,
    createCharacterMessage,
    createUserMessage,
    isActiveSwipeError,
    updateActiveSwipeAttachments,
    updateActiveSwipeContent,
    updateActiveSwipeReasoning,
} from "#frontend/lib/messages";
import {
    getInputMiddlewares,
    getOutputMiddlewares,
    getPromptMiddlewares,
} from "#frontend/lib/plugins/registry";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import { compilePresetMessages } from "#frontend/lib/presets/compile";
import { resolvePresetMacros } from "#frontend/lib/presets/macros";
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

type UseChatSessionOptions = {
    chat?: ChatSession;
    character: SmileyCharacter;
    connectionSettings: ConnectionSettings;
    mode: ChatMode;
    onChatChange: (chat: ChatSession) => void;
    persona: SmileyPersona;
    preferences: AppPreferences;
    presetCollection: PresetCollection;
    userStatus: UserStatus;
};

type ActiveGeneration = {
    controller: AbortController;
    streamingMessageId?: string;
    swipeMessageId?: string;
};

const emptyGenerationSuppressMs = 750;

export function useChatSession({
    chat,
    character,
    connectionSettings,
    mode,
    onChatChange,
    persona,
    preferences,
    presetCollection,
    userStatus,
}: UseChatSessionOptions) {
    const [pendingChatIds, setPendingChatIds] = useState<string[]>([]);
    const [pendingSwipeMessageIds, setPendingSwipeMessageIds] = useState<
        Record<string, string>
    >({});
    const [chatError, setChatError] = useState("");
    const latestChatRef = useRef<ChatSession | undefined>(chat);
    const pendingChatIdsRef = useRef<string[]>([]);
    const pendingSwipeMessageIdsRef = useRef<Record<string, string>>({});
    const activeGenerationsRef = useRef<Record<string, ActiveGeneration>>({});
    const suppressEmptyGenerationUntilRef = useRef<Record<string, number>>({});

    latestChatRef.current = latestChatValue(latestChatRef.current, chat);
    pendingChatIdsRef.current = pendingChatIds;
    pendingSwipeMessageIdsRef.current = pendingSwipeMessageIds;

    useEffect(() => {
        setChatError("");
    }, [chat?.id]);

    const activePreset = useMemo(
        () =>
            presetCollection.presets.find(
                (preset) => preset.id === presetCollection.activePresetId,
            ),
        [presetCollection],
    );

    function resolveChatMacros(
        content: string,
        sourceMessages: Message[],
        sourceCharacter = character,
    ) {
        return resolvePresetMacros(content, {
            character: sourceCharacter,
            messages: sourceMessages,
            mode,
            personaDescription: persona.description,
            personaName: persona.name,
            userStatus,
        });
    }

    async function sendMessage(draft: string, images: File[] = []) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        const generationCharacter = character;
        const sourceMessages = sourceChat.messages;
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
            images.length === 0 &&
            performance.now() < (suppressEmptyGenerationUntilRef.current[chatId] ?? 0)
        ) {
            return;
        }

        let attachments: ChatAttachment[] = [];

        try {
            attachments = images.length
                ? await uploadMessageAttachments(chatId, images)
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
            ? createCharacterMessage(generationCharacter.data.name, "")
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
                    stream: preferences.chat.streaming,
                    onToken: streamingReply
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedContent += token;
                              updateMessageContent(streamingReply.id, streamedContent);
                          }
                        : undefined,
                    onReasoningToken: streamingReply
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedReasoning += token;
                              updateMessageReasoning(
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
                              updateMessageAttachments(
                                  streamingReply.id,
                                  imageUrlsToAttachments(streamedImages),
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
                const resultAttachments = imageUrlsToAttachments(result.images ?? []);
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
            } else {
                const reply = withMessageReasoning(
                    createCharacterMessage(
                        generationCharacter.data.name,
                        result.message,
                        imageUrlsToAttachments(result.images ?? []),
                    ),
                    result.reasoning,
                    result.reasoningDetails,
                );

                updateChatMessages(
                    [...pendingChat.messages, reply],
                    currentOrSourceChat(pendingChat),
                );
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

    function deleteMessage(messageId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.filter((message) => message.id !== messageId),
            sourceChat,
        );
    }

    function editMessage(messageId: string, content: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeContent(
                          message,
                          resolveChatMacros(
                              content,
                              sourceChat.messages.filter((item) => item.id !== messageId),
                          ),
                          undefined,
                          "",
                      )
                    : message,
            ),
            sourceChat,
        );
    }

    function previousSwipe(messageId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? {
                          ...message,
                          activeSwipeIndex: Math.max(0, message.activeSwipeIndex - 1),
                      }
                    : message,
            ),
            sourceChat,
        );
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

        if (targetMessage.activeSwipeIndex < targetMessage.swipes.length - 1) {
            updateChatMessages(
                sourceChat.messages.map((message) =>
                    message.id === messageId
                        ? {
                              ...message,
                              activeSwipeIndex: message.activeSwipeIndex + 1,
                          }
                        : message,
                ),
                sourceChat,
            );
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
        const generationCharacter = character;

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
                updateChatMessages(
                    sourceChat.messages.map((message) =>
                        message.id === messageId
                            ? appendMessageSwipe(message, "")
                            : message,
                    ),
                    sourceChat,
                );
            }

            const result = await generateWithPreset(
                historyBeforeTarget,
                generationCharacter,
                mode,
                userStatus,
                connectionSettings,
                {
                    stream: preferences.chat.streaming,
                    onToken: preferences.chat.streaming
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedContent += token;
                              updateMessageContent(messageId, streamedContent);
                          }
                        : undefined,
                    onReasoningToken: preferences.chat.streaming
                        ? (token) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedReasoning += token;
                              updateMessageReasoning(messageId, streamedReasoning);
                          }
                        : undefined,
                    onImage: preferences.chat.streaming
                        ? (url) => {
                              if (abortController.signal.aborted) {
                                  return;
                              }
                              streamedImages.push(url);
                              updateMessageAttachments(
                                  messageId,
                                  imageUrlsToAttachments(streamedImages),
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
                updateMessageContent(
                    messageId,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                );
                const resultAttachments = imageUrlsToAttachments(result.images ?? []);
                if (resultAttachments.length) {
                    updateMessageAttachments(messageId, resultAttachments);
                }
            } else {
                updateChatMessages(
                    targetChat.messages.map((message) =>
                        message.id === messageId
                            ? appendMessageSwipe(
                                  message,
                                  result.message,
                                  undefined,
                                  result.reasoning,
                                  result.reasoningDetails,
                              )
                            : message,
                    ),
                    targetChat,
                );
                const resultAttachments = imageUrlsToAttachments(result.images ?? []);
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
            updateChatMessages(
                targetChat.messages.map((message) =>
                    message.id === messageId
                        ? preferences.chat.streaming
                            ? updateActiveSwipeContent(
                                  message,
                                  generationErrorMessage(error),
                                  "error",
                              )
                            : appendMessageSwipe(
                                  message,
                                  generationErrorMessage(error),
                                  "error",
                              )
                        : message,
                ),
                targetChat,
            );
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

    function stopGeneration() {
        const activeChatId = latestChatRef.current?.id;

        if (!activeChatId) {
            return;
        }

        const activeGeneration = activeGenerationsRef.current[activeChatId];

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

    function updateChatMessages(messages: Message[], sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return;
        }

        const nextChat = {
            ...sourceChat,
            messages,
            updatedAt: new Date().toISOString(),
        };

        if (latestChatRef.current?.id === nextChat.id) {
            latestChatRef.current = nextChat;
        }
        onChatChange(nextChat);
    }

    function updateMessageContent(
        messageId: string,
        content: string,
        status?: Message["swipes"][number]["status"],
        reasoning?: string,
        reasoningDetails?: unknown,
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeContent(
                          message,
                          content,
                          status,
                          reasoning,
                          reasoningDetails,
                      )
                    : message,
            ),
            sourceChat,
        );
    }

    function updateMessageReasoning(
        messageId: string,
        reasoning: string,
        reasoningDetails?: unknown,
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeReasoning(message, reasoning, reasoningDetails)
                    : message,
            ),
            sourceChat,
        );
    }

    function updateMessageAttachments(
        messageId: string,
        attachments: ChatAttachment[],
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeAttachments(message, attachments)
                    : message,
            ),
            sourceChat,
        );
    }

    function removeMessage(messageId: string, sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.filter((message) => message.id !== messageId),
            sourceChat,
        );
    }

    function removeActiveSwipe(messageId: string, sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) => {
                if (message.id !== messageId || message.swipes.length <= 1) {
                    return message;
                }

                const swipes = message.swipes.filter(
                    (_swipe, index) => index !== message.activeSwipeIndex,
                );

                return {
                    ...message,
                    activeSwipeIndex: Math.max(
                        0,
                        Math.min(message.activeSwipeIndex - 1, swipes.length - 1),
                    ),
                    swipes,
                };
            }),
            sourceChat,
        );
    }

    function cleanupEmptyAbortedGeneration(
        chatId: string,
        activeGeneration = activeGenerationsRef.current[chatId],
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat || sourceChat.id !== chatId || !activeGeneration) {
            return;
        }

        if (activeGeneration.streamingMessageId) {
            const message = sourceChat.messages.find(
                (item) => item.id === activeGeneration.streamingMessageId,
            );

            if (message && isActiveMessageSwipeEmpty(message)) {
                removeMessage(message.id, sourceChat);
            }
        }

        if (activeGeneration.swipeMessageId) {
            const message = sourceChat.messages.find(
                (item) => item.id === activeGeneration.swipeMessageId,
            );

            if (
                message &&
                message.swipes.length > 1 &&
                isActiveMessageSwipeEmpty(message)
            ) {
                removeActiveSwipe(message.id, sourceChat);
            }
        }
    }

    function currentOrSourceChat(sourceChat: ChatSession) {
        return latestChatRef.current?.id === sourceChat.id
            ? latestChatRef.current
            : sourceChat;
    }

    function isChatPending(chatId: string) {
        return (
            pendingChatIdsRef.current.includes(chatId) ||
            Boolean(pendingSwipeMessageIdsRef.current[chatId])
        );
    }

    function beginChatPending(chatId: string, swipeMessageId = "") {
        setPendingChatIds((current) => {
            const next = current.includes(chatId) ? current : [...current, chatId];
            pendingChatIdsRef.current = next;
            return next;
        });

        if (swipeMessageId) {
            setPendingSwipeMessageIds((current) => {
                const next = {
                    ...current,
                    [chatId]: swipeMessageId,
                };
                pendingSwipeMessageIdsRef.current = next;
                return next;
            });
        }
    }

    function endChatPending(chatId: string) {
        setPendingChatIds((current) => {
            const next = current.filter((id) => id !== chatId);
            pendingChatIdsRef.current = next;
            return next;
        });
        setPendingSwipeMessageIds((current) => {
            if (!current[chatId]) {
                return current;
            }

            const next = { ...current };
            delete next[chatId];
            pendingSwipeMessageIdsRef.current = next;
            return next;
        });
    }

    function beginGenerationController(
        chatId: string,
        target: Omit<ActiveGeneration, "controller"> = {},
    ) {
        const controller = new AbortController();
        activeGenerationsRef.current = {
            ...activeGenerationsRef.current,
            [chatId]: {
                controller,
                ...target,
            },
        };
        return controller;
    }

    function endGenerationController(chatId: string, controller: AbortController) {
        if (activeGenerationsRef.current[chatId]?.controller !== controller) {
            return;
        }

        const next = { ...activeGenerationsRef.current };
        delete next[chatId];
        activeGenerationsRef.current = next;
    }

    async function generateWithPreset(
        sourceMessages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        sourceConnectionSettings: ConnectionSettings,
        options: {
            onImage?: (url: string) => void;
            onReasoningToken?: (token: string) => void;
            onToken?: (token: string) => void;
            signal?: AbortSignal;
            stream?: boolean;
        } = {},
    ) {
        const generationMessages = sourceMessages.filter(
            (message) => !isActiveSwipeError(message),
        );
        const presetContext = {
            character: sourceCharacter,
            messages: generationMessages,
            mode: sourceMode,
            personaDescription: persona.description,
            personaName: persona.name,
            userStatus: sourceUserStatus,
        };
        const connection = getAdapterForSettings(sourceConnectionSettings);
        const promptMessages = await applyPromptMiddlewares(
            compilePresetMessages(activePreset, presetContext),
            generationMessages,
            sourceCharacter,
            sourceMode,
            sourceUserStatus,
        );
        const materializedPromptMessages =
            await materializeChatGenerationMessageImages(promptMessages);
        const result = await connection.generate({
            messages: generationMessages,
            onImage: options.onImage,
            onReasoningToken: options.onReasoningToken,
            onToken: options.onToken,
            promptMessages: materializedPromptMessages,
            signal: options.signal,
            stream: options.stream,
        });
        const message = await applyOutputMiddlewares(
            result.message,
            generationMessages,
            sourceCharacter,
            sourceMode,
            sourceUserStatus,
            result,
        );

        return { ...result, message };
    }

    async function applyInputMiddlewares(
        content: string,
        messages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
    ) {
        let nextContent = content;

        for (const middleware of getInputMiddlewares()) {
            nextContent = await middleware(nextContent, {
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                persona,
                userStatus: sourceUserStatus,
            });
        }

        return nextContent.trim();
    }

    async function applyPromptMiddlewares(
        promptMessages: ReturnType<typeof compilePresetMessages>,
        messages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
    ) {
        let nextMessages = promptMessages;

        for (const middleware of getPromptMiddlewares()) {
            nextMessages = await middleware(nextMessages, {
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                persona,
                promptMessages: nextMessages,
                userStatus: sourceUserStatus,
            });
        }

        return nextMessages;
    }

    async function applyOutputMiddlewares(
        content: string,
        messages: Message[],
        sourceCharacter: SmileyCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        result: Awaited<ReturnType<ReturnType<typeof getAdapterForSettings>["generate"]>>,
    ) {
        let nextContent = content;

        for (const middleware of getOutputMiddlewares()) {
            nextContent = await middleware(nextContent, {
                character: sourceCharacter,
                messages,
                mode: sourceMode,
                persona,
                result,
                userStatus: sourceUserStatus,
            });
        }

        return nextContent;
    }

    const activeChatId = chat?.id ?? "";

    return {
        chatError,
        deleteMessage,
        editMessage,
        isSending: activeChatId ? pendingChatIds.includes(activeChatId) : false,
        messages: chat?.messages ?? [],
        nextSwipe,
        pendingSwipeMessageId: activeChatId
            ? (pendingSwipeMessageIds[activeChatId] ?? "")
            : "",
        previousSwipe,
        sendMessage,
        stopGeneration,
    };
}

function generationErrorMessage(error: unknown) {
    return `Generation failed: ${messageFromError(error)}`;
}

function isAbortError(error: unknown) {
    return (
        error instanceof DOMException && error.name === "AbortError"
    ) || (error instanceof Error && error.name === "AbortError");
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

async function uploadMessageAttachments(chatId: string, images: File[]) {
    if (images.length === 0) {
        return [];
    }

    const result = await uploadChatAttachments(chatId, images);
    return result.attachments;
}

function imageUrlsToAttachments(urls: string[]): ChatAttachment[] {
    return urls.map((url, index) => ({
        id: `generated-image-${index + 1}`,
        type: "image",
        url,
        name: `Generated image ${index + 1}`,
    }));
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
