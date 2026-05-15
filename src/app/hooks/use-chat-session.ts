import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import type { ConnectionSettings } from "#frontend/lib/connections/config";
import { getAdapterForSettings } from "#frontend/lib/connections/registry";
import {
    appendMessageSwipe,
    createCharacterErrorMessage,
    createCharacterMessage,
    createUserMessage,
    isActiveSwipeError,
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
    ChatSession,
    Message,
    ScyllaCharacter,
    ScyllaPersona,
    UserStatus,
} from "#frontend/types";

type UseChatSessionOptions = {
    chat?: ChatSession;
    character: ScyllaCharacter;
    connectionSettings: ConnectionSettings;
    mode: ChatMode;
    onChatChange: (chat: ChatSession) => void;
    persona: ScyllaPersona;
    preferences: AppPreferences;
    presetCollection: PresetCollection;
    userStatus: UserStatus;
};

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

    async function sendMessage(draft: string) {
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
        const userMessage = text ? createUserMessage(text, persona) : undefined;
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
        setChatError("");
        beginChatPending(chatId);

        try {
            const streamingReply = preferences.chat.streaming
                ? createCharacterMessage(generationCharacter.data.name, "")
                : undefined;

            if (streamingReply) {
                updateChatMessages(
                    [...pendingChat.messages, streamingReply],
                    currentOrSourceChat(pendingChat),
                );
            }

            let streamedContent = "";
            let streamedReasoning = "";
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
                              streamedContent += token;
                              updateMessageContent(streamingReply.id, streamedContent);
                          }
                        : undefined,
                    onReasoningToken: streamingReply
                        ? (token) => {
                              streamedReasoning += token;
                              updateMessageReasoning(
                                  streamingReply.id,
                                  streamedReasoning,
                              );
                          }
                        : undefined,
                },
            );

            if (streamingReply) {
                updateMessageContent(
                    streamingReply.id,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                );
            } else {
                const reply = withMessageReasoning(
                    createCharacterMessage(generationCharacter.data.name, result.message),
                    result.reasoning,
                    result.reasoningDetails,
                );

                updateChatMessages(
                    [...pendingChat.messages, reply],
                    currentOrSourceChat(pendingChat),
                );
            }
        } catch (error) {
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

            let streamedContent = "";
            let streamedReasoning = "";
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
                              streamedContent += token;
                              updateMessageContent(messageId, streamedContent);
                          }
                        : undefined,
                    onReasoningToken: preferences.chat.streaming
                        ? (token) => {
                              streamedReasoning += token;
                              updateMessageReasoning(messageId, streamedReasoning);
                          }
                        : undefined,
                },
            );

            const targetChat = currentOrSourceChat(sourceChat);
            if (preferences.chat.streaming) {
                updateMessageContent(
                    messageId,
                    result.message,
                    undefined,
                    result.reasoning,
                    result.reasoningDetails,
                );
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
            }
        } catch (error) {
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
            endChatPending(chatId);
        }
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

    async function generateWithPreset(
        sourceMessages: Message[],
        sourceCharacter: ScyllaCharacter,
        sourceMode: ChatMode,
        sourceUserStatus: UserStatus,
        sourceConnectionSettings: ConnectionSettings,
        options: {
            onReasoningToken?: (token: string) => void;
            onToken?: (token: string) => void;
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
        const result = await connection.generate({
            messages: generationMessages,
            onReasoningToken: options.onReasoningToken,
            onToken: options.onToken,
            promptMessages,
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
        sourceCharacter: ScyllaCharacter,
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
        sourceCharacter: ScyllaCharacter,
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
        sourceCharacter: ScyllaCharacter,
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
    };
}

function generationErrorMessage(error: unknown) {
    return `Generation failed: ${messageFromError(error)}`;
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
