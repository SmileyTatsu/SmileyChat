import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import {
    loadLorebook,
    loadLorebookSummaries,
    uploadChatAttachments,
} from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { clampInteger, clampNumber } from "#frontend/lib/common/math";
import {
    type ConnectionSettings,
    getActiveConnectionProfile,
} from "#frontend/lib/connections/config";
import { materializeChatGenerationMessageImages } from "#frontend/lib/connections/images";
import { getAdapterForSettings } from "#frontend/lib/connections/registry";
import {
    appendMessageSwipe,
    createCharacterErrorMessage,
    createCharacterMessage,
    createInjectedMessage,
    createUserMessage,
    getMessageContent,
    isActiveSwipeError,
    updateActiveSwipeAttachments,
    updateActiveSwipeContent,
    updateActiveSwipeReasoning,
} from "#frontend/lib/messages";
import {
    clearStreamingMessageDraft,
    getStreamingMessageDraft,
    hasStreamingMessageDraftValue,
    setStreamingMessageAttachments,
    setStreamingMessageContent,
    setStreamingMessageReasoning,
    type StreamingMessageDraft,
} from "#frontend/lib/streaming-message-drafts";
import { isGroupChat } from "#frontend/lib/chats/normalize";
import { createLorebookPromptInjections } from "#frontend/lib/lorebooks/engine";
import { isLorebookEnabled } from "#frontend/lib/lorebooks/normalize";
import type { Lorebook } from "#frontend/lib/lorebooks/types";
import {
    getInputMiddlewares,
    getOutputMiddlewares,
    getPromptContextMiddlewares,
    getPromptInjectors,
    getPromptMiddlewares,
} from "#frontend/lib/plugins/registry";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import { compilePresetMessages } from "#frontend/lib/presets/compile";
import {
    defaultContextTokenBudget,
    normalizeContextTokenBudget,
} from "#frontend/lib/presets/context-budget-constants";
import { resolvePresetMacros } from "#frontend/lib/presets/macros";
import type { PresetCollection } from "#frontend/lib/presets/types";
import {
    assertPromptMessagesWithinBudget,
    buildPromptForGeneration,
} from "#frontend/lib/prompt/build";
import type { PromptGenerationTrigger } from "#frontend/lib/prompt/types";
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
    groupCharacters?: SmileyCharacter[];
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

type SendMessageOptions = {
    autoTurnCount?: number;
    forcedCharacterId?: string;
    images?: File[];
    suppressAutoResponses?: boolean;
};

const emptyGenerationSuppressMs = 750;

export function useChatSession({
    chat,
    character,
    connectionSettings,
    groupCharacters = [],
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
    const autoResponseTimerRef = useRef<number | undefined>(undefined);
    const suppressEmptyGenerationUntilRef = useRef<Record<string, number>>({});

    latestChatRef.current = latestChatValue(latestChatRef.current, chat);
    pendingChatIdsRef.current = pendingChatIds;
    pendingSwipeMessageIdsRef.current = pendingSwipeMessageIds;

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

    const activePreset = useMemo(
        () =>
            presetCollection.presets.find(
                (preset) => preset.id === presetCollection.activePresetId,
            ),
        [presetCollection],
    );
    const contextTokenBudget = normalizeContextTokenBudget(
        getActiveConnectionProfile(connectionSettings)?.contextTokenBudget,
        defaultContextTokenBudget,
    );

    function resolveChatMacros(
        content: string,
        sourceMessages: Message[],
        sourceCharacter = character,
    ) {
        return resolvePresetMacros(content, {
            character: sourceCharacter,
            group: groupPromptContext(latestChatRef.current),
            messages: sourceMessages,
            mode,
            personaDescription: persona.description,
            personaName: persona.name,
            userStatus,
        });
    }

    async function sendMessage(draft: string, images: File[] = []) {
        return sendMessageWithOptions(draft, { images });
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
        const images = options.images ?? [];
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        if (
            (draft.trim() || images.length || options.forcedCharacterId) &&
            !options.autoTurnCount
        ) {
            clearAutomaticResponseTimer();
        }

        const sourceMessages = sourceChat.messages;
        const generationCharacter = selectGenerationCharacter(
            sourceChat,
            sourceMessages,
            options.forcedCharacterId,
        );
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
                    promptCharacter: promptCharacterForGeneration(
                        sourceChat,
                        generationCharacter,
                    ),
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
                              setStreamingMessageAttachments(
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
                const resultAttachments = imageUrlsToAttachments(
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
                const reply = withMessageReasoning(
                    createCharacterMessage(
                        generationCharacter.data.name,
                        result.message,
                        imageUrlsToAttachments(result.images ?? []),
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

    async function injectMessage(
        role: "character" | "system" | "user",
        content: string,
        options: {
            authorName?: string;
            avatarPath?: string;
            includeInPrompt?: boolean;
            pluginId: string;
            promptRole?: "assistant" | "user" | "system" | "none";
        },
    ) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        const text = resolveChatMacros(content.trim(), sourceChat.messages);

        if (!text) {
            return;
        }

        updateChatMessages(
            [
                ...sourceChat.messages,
                createInjectedMessage(role, text, {
                    activeCharacter: character,
                    authorName: options.authorName,
                    avatarPath: options.avatarPath,
                    includeInPrompt: options.includeInPrompt,
                    persona,
                    pluginId: options.pluginId,
                    promptRole: options.promptRole,
                }),
            ],
            sourceChat,
        );
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
        const generationCharacter =
            groupCharacters.find((item) => item.id === targetMessage.authorCharacterId) ??
            selectGenerationCharacter(sourceChat, historyBeforeTarget);

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
                    promptCharacter: promptCharacterForGeneration(
                        sourceChat,
                        generationCharacter,
                    ),
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
                              setStreamingMessageAttachments(
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
                const resultAttachments = imageUrlsToAttachments(
                    result.images?.length ? result.images : streamedImages,
                );
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

        clearAutomaticResponseTimer();

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

        if (eligibleGroupCharacters(sourceChat, sourceChat.messages).length === 0) {
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
        finalizeStreamingMessageDraft(messageId);
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
        finalizeStreamingMessageDraft(messageId);
    }

    function updateMessageAttachments(messageId: string, attachments: ChatAttachment[]) {
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
        finalizeStreamingMessageDraft(messageId);
    }

    function removeMessage(messageId: string, sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.filter((message) => message.id !== messageId),
            sourceChat,
        );
        clearStreamingMessageDraft(messageId);
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
        clearStreamingMessageDraft(messageId);
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

    function commitStreamingDraft(messageId: string, sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return false;
        }

        const draft = getStreamingMessageDraft(messageId);

        if (!hasStreamingMessageDraftValue(draft)) {
            clearStreamingMessageDraft(messageId);
            return false;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? applyStreamingDraftToMessage(message, draft)
                    : message,
            ),
            sourceChat,
        );
        finalizeStreamingMessageDraft(messageId);
        return true;
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
            promptCharacter?: SmileyCharacter;
            onReasoningToken?: (token: string) => void;
            onToken?: (token: string) => void;
            signal?: AbortSignal;
            sourceChat?: ChatSession;
            stream?: boolean;
            targetMessageId?: string;
            trigger?: PromptGenerationTrigger;
        } = {},
    ) {
        const sourceGenerationMessages = sourceMessages.filter(
            (message) => !isActiveSwipeError(message),
        );
        const promptCharacter = options.promptCharacter ?? sourceCharacter;
        const promptChat = options.sourceChat ?? latestChatRef.current;

        if (!promptChat) {
            throw new Error("No active chat is available for prompt generation.");
        }

        const nativeLorebooks = await loadNativeLorebooks(promptChat, promptCharacter);
        const promptBuild = await buildPromptForGeneration({
            context: {
                chat: promptChat,
                character: promptCharacter,
                group: groupPromptContext(latestChatRef.current),
                groupCharacters,
                generation: {
                    activeCharacterId: sourceCharacter.id,
                    stream: options.stream === true,
                    ...(options.targetMessageId
                        ? { targetMessageId: options.targetMessageId }
                        : {}),
                    trigger: options.trigger ?? "send",
                },
                messages: sourceGenerationMessages,
                mode: sourceMode,
                persona,
                preset: activePreset,
                tokenBudget: contextTokenBudget,
                userStatus: sourceUserStatus,
            },
            contextMiddlewares: getPromptContextMiddlewares(),
            injectors: [
                (context) =>
                    createLorebookPromptInjections(nativeLorebooks, {
                        generation: context.generation,
                        messages: context.messages,
                        resolveContent: (content) =>
                            resolvePresetMacros(content, {
                                character: context.character,
                                group: context.group,
                                messages: context.messages,
                                mode: context.mode,
                                personaDescription: context.persona.description,
                                personaName: context.persona.name,
                                userStatus: context.userStatus,
                            }),
                    }),
                ...getPromptInjectors(),
            ],
        });
        const generationMessages = promptBuild.messages;
        const connection = getAdapterForSettings(sourceConnectionSettings);
        const promptMessages = await applyPromptMiddlewares(
            promptBuild.promptMessages,
            generationMessages,
            promptCharacter,
            sourceMode,
            sourceUserStatus,
        );
        assertPromptMessagesWithinBudget(promptMessages, contextTokenBudget);
        const materializedPromptMessages =
            await materializeChatGenerationMessageImages(promptMessages);
        const result = await connection.generate({
            messages: generationMessages,
            debug: promptBuild.debug,
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

    async function loadNativeLorebooks(
        sourceChat: ChatSession,
        sourceCharacter: SmileyCharacter,
    ): Promise<Lorebook[]> {
        try {
            const collection = await loadLorebookSummaries();
            const lorebookIds = Array.from(
                new Set(
                    [
                        collection.activeLorebookId,
                        ...(sourceChat.metadata?.lorebookIds ?? []),
                        sourceCharacter.metadata?.primaryLorebookId,
                        ...(sourceCharacter.metadata?.lorebookIds ?? []),
                        ...(persona.metadata?.lorebookIds ?? []),
                    ].filter((id): id is string => Boolean(id)),
                ),
            );

            const lorebooks = await Promise.all(
                lorebookIds.map(async (lorebookId) => {
                    try {
                        return await loadLorebook(lorebookId);
                    } catch {
                        return undefined;
                    }
                }),
            );

            return lorebooks
                .filter((item): item is Lorebook => Boolean(item))
                .filter(isLorebookEnabled);
        } catch (error) {
            console.warn("Failed to load native LoreBooks:", error);
            return [];
        }
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

    function selectGenerationCharacter(
        sourceChat: ChatSession,
        messages: Message[],
        forcedCharacterId = "",
    ) {
        if (!isGroupChat(sourceChat) || groupCharacters.length === 0) {
            return character;
        }

        if (forcedCharacterId) {
            return (
                groupCharacters.find((item) => item.id === forcedCharacterId) ?? character
            );
        }

        const availableCharacters = eligibleGroupCharacters(sourceChat, messages);

        if (availableCharacters.length === 0) {
            return groupCharacters[0] ?? character;
        }

        const replyOrder = sourceChat.group?.replyOrder ?? "list";

        if (replyOrder === "pooled") {
            return selectPooledGroupCharacter(availableCharacters, messages);
        }

        if (replyOrder === "natural") {
            return selectNaturalGroupCharacter(availableCharacters, messages);
        }

        return selectListGroupCharacter(availableCharacters, messages);
    }

    function eligibleGroupCharacters(sourceChat: ChatSession, messages: Message[]) {
        if (!isGroupChat(sourceChat)) {
            return [];
        }

        const lastMessage = messages[messages.length - 1];
        const lastSpeakerId =
            lastMessage?.role === "character"
                ? lastMessage.authorCharacterId ||
                  groupCharacters.find((item) => item.data.name === lastMessage.author)
                      ?.id ||
                  ""
                : "";
        const allowSelfResponses = sourceChat.group?.allowSelfResponses === true;

        return (sourceChat.members ?? [])
            .slice()
            .sort((left, right) => left.order - right.order)
            .filter((member) => !member.muted)
            .map((member) =>
                groupCharacters.find((item) => item.id === member.characterId),
            )
            .filter(
                (item): item is SmileyCharacter =>
                    item !== undefined &&
                    (allowSelfResponses || item.id !== lastSpeakerId),
            );
    }

    function selectListGroupCharacter(
        availableCharacters: SmileyCharacter[],
        messages: Message[],
    ) {
        const lastCharacterMessage = [...messages]
            .reverse()
            .find((message) => message.role === "character");
        const lastIndex = availableCharacters.findIndex(
            (item) =>
                item.id === lastCharacterMessage?.authorCharacterId ||
                item.data.name === lastCharacterMessage?.author,
        );

        return availableCharacters[(lastIndex + 1) % availableCharacters.length];
    }

    function selectPooledGroupCharacter(
        availableCharacters: SmileyCharacter[],
        messages: Message[],
    ) {
        const lastUserIndex = findLastIndex(
            messages,
            (message) => message.role === "user",
        );
        const spokenSinceUser = new Set(
            messages
                .slice(lastUserIndex + 1)
                .filter((message) => message.role === "character")
                .map((message) => message.authorCharacterId || message.author),
        );
        const unspoken = availableCharacters.filter(
            (item) =>
                !spokenSinceUser.has(item.id) && !spokenSinceUser.has(item.data.name),
        );
        const pool = unspoken.length ? unspoken : availableCharacters;

        return pool[Math.floor(Math.random() * pool.length)];
    }

    function selectNaturalGroupCharacter(
        availableCharacters: SmileyCharacter[],
        messages: Message[],
    ) {
        const lastMessage = messages[messages.length - 1];
        const lastContent = lastMessage ? getMessageContent(lastMessage) : "";
        const mentioned = availableCharacters.filter((item) =>
            characterNameMentioned(lastContent, item.data.name),
        );

        if (mentioned.length) {
            return mentioned[Math.floor(Math.random() * mentioned.length)];
        }
        const activated = availableCharacters.filter((item) => {
            const talkativeness =
                latestChatRef.current?.members?.find(
                    (member) => member.characterId === item.id,
                )?.talkativeness ?? 0.5;
            return Math.random() < talkativeness;
        });
        const pool = activated.length ? activated : availableCharacters;

        return pool[Math.floor(Math.random() * pool.length)];
    }

    function characterNameMentioned(content: string, characterName: string) {
        const safeName = characterName.trim();

        if (!safeName) {
            return false;
        }

        return new RegExp(`\\b${escapeRegExp(safeName)}\\b`, "i").test(content);
    }

    function promptCharacterForGeneration(
        sourceChat: ChatSession,
        activeSpeaker: SmileyCharacter,
    ) {
        if (
            !isGroupChat(sourceChat) ||
            sourceChat.group?.generationMode !== "join-character-cards"
        ) {
            return sourceChat.group?.scenarioOverride
                ? {
                      ...activeSpeaker,
                      data: {
                          ...activeSpeaker.data,
                          scenario: sourceChat.group.scenarioOverride,
                      },
                  }
                : activeSpeaker;
        }

        const memberIds = new Set(
            (sourceChat.members ?? []).map((member) => member.characterId),
        );
        const orderedCharacters = (sourceChat.members ?? [])
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((member) =>
                groupCharacters.find((character) => character.id === member.characterId),
            )
            .filter((item): item is SmileyCharacter => Boolean(item));

        if (orderedCharacters.length <= 1 || !memberIds.has(activeSpeaker.id)) {
            return activeSpeaker;
        }

        return {
            ...activeSpeaker,
            data: {
                ...activeSpeaker.data,
                description: joinCharacterField(
                    orderedCharacters,
                    sourceChat.group?.joinPrefix,
                    "Description",
                    (item) => item.data.description,
                ),
                personality: joinCharacterField(
                    orderedCharacters,
                    sourceChat.group?.joinPrefix,
                    "Personality",
                    (item) => item.data.personality,
                ),
                scenario:
                    sourceChat.group?.scenarioOverride ||
                    joinCharacterField(
                        orderedCharacters,
                        sourceChat.group?.joinPrefix,
                        "Scenario",
                        (item) => item.data.scenario,
                    ),
                mes_example: activeSpeaker.data.mes_example,
                system_prompt: [
                    `This is a group chat. The active speaker for the next reply is ${activeSpeaker.data.name}.`,
                    joinCharacterField(
                        orderedCharacters,
                        sourceChat.group?.joinPrefix,
                        "System prompt",
                        (item) => item.data.system_prompt,
                    ),
                ]
                    .filter(Boolean)
                    .join("\n\n"),
                post_history_instructions: [
                    activeSpeaker.data.post_history_instructions,
                    groupInstructionSections(orderedCharacters),
                ]
                    .filter((part) => part.trim())
                    .join("\n\n"),
            },
        };
    }

    function groupPromptContext(sourceChat: ChatSession | undefined) {
        if (!sourceChat || !isGroupChat(sourceChat)) {
            return undefined;
        }

        return {
            joinPrefix: sourceChat.group?.joinPrefix,
            memberIds: (sourceChat.members ?? []).map((member) => member.characterId),
        };
    }

    const activeChatId = chat?.id ?? "";

    return {
        chatError,
        deleteMessage,
        editMessage,
        isSending: activeChatId ? pendingChatIds.includes(activeChatId) : false,
        injectMessage,
        messages: chat?.messages ?? [],
        nextSwipe,
        pendingSwipeMessageId: activeChatId
            ? (pendingSwipeMessageIds[activeChatId] ?? "")
            : "",
        previousSwipe,
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

function applyStreamingDraftToMessage(
    message: Message,
    draft: StreamingMessageDraft | undefined,
) {
    if (!draft) {
        return message;
    }

    const nextMessage = updateActiveSwipeContent(
        message,
        draft.content ?? getMessageContent(message),
        draft.status,
        draft.reasoning,
        draft.reasoningDetails,
    );

    return draft.attachments !== undefined
        ? updateActiveSwipeAttachments(nextMessage, draft.attachments)
        : nextMessage;
}

function finalizeStreamingMessageDraft(messageId: string) {
    requestAnimationFrame(() => clearStreamingMessageDraft(messageId));
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

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (predicate(items[index])) {
            return index;
        }
    }

    return -1;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinCharacterField(
    characters: SmileyCharacter[],
    prefixTemplate: string | undefined,
    fieldName: string,
    valueForCharacter: (character: SmileyCharacter) => string,
) {
    const safePrefixTemplate = prefixTemplate ?? "{{char}}:";

    return characters
        .map((character) => {
            const value = valueForCharacter(character).trim();

            if (!value) {
                return "";
            }

            const prefix = safePrefixTemplate.replace(
                /\{\{char\}\}/g,
                character.data.name,
            );

            return [prefix, `${fieldName}:\n${value}`].filter(Boolean).join("\n");
        })
        .filter(Boolean)
        .join("\n\n");
}

function groupInstructionSections(characters: SmileyCharacter[]) {
    return characters
        .map((character) => {
            const value = character.data.post_history_instructions.trim();

            if (!value) {
                return "";
            }

            return `Post-history instructions for ${character.data.name}:\n${value}`;
        })
        .filter(Boolean)
        .join("\n\n");
}
