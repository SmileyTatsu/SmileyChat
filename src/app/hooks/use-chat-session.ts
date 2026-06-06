import { useEffect, useRef, useState } from "preact/hooks";

import { uploadChatAttachments } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { clampInteger, clampNumber } from "#frontend/lib/common/math";
import type { ConnectionSettings } from "#frontend/lib/connections/config";
import {
    createCharacterErrorMessage,
    createCharacterMessage,
    createUserMessage,
    getMessageContent,
    updateActiveSwipeContent,
} from "#frontend/lib/messages";
import {
    setStreamingMessageAttachments,
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
    images?: File[];
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
    const { applyInputMiddlewares, generateWithPreset, resolveChatMacros } =
        usePromptGeneration({
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
                appendEmptySwipe(messageId, sourceChat);
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
                appendSwipe(
                    messageId,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
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
