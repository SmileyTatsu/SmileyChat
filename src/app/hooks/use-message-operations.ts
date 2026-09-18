import {
    appendMessageSwipe,
    createInjectedMessage,
    removeActiveMessageSwipe,
    updateActiveSwipeAttachments,
    updateActiveSwipeContent,
    updateActiveSwipeReasoning,
    setActiveSwipePendingToolContinuation,
    getMessageContent,
} from "#frontend/lib/messages";
import {
    clearStreamingMessageDraft,
    flushStreamingMessageDraft,
    getStreamingMessageDraft,
    hasStreamingMessageDraftValue,
    type StreamingMessageDraft,
} from "#frontend/lib/streaming-message-drafts";
import {
    deleteLocalChatAttachments,
    uploadMessageAttachments,
} from "./chat-session-attachments";
import { getMessageUpdateMiddlewares } from "#frontend/lib/plugins/registry";
import { clientLogger } from "#frontend/lib/logging/client-logger";
import type { MessageUpdateKind } from "#frontend/lib/plugins/types";
import type {
    ChatAttachment,
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
} from "#frontend/types";

type MutableRef<T> = {
    current: T;
};

type UseMessageOperationsOptions = {
    character: SmileyCharacter;
    latestChatRef: MutableRef<ChatSession | undefined>;
    onChatChange: (chat: ChatSession) => void;
    persona: SmileyPersona;
    resolveChatMacros: (
        content: string,
        sourceMessages: Message[],
        sourceCharacter?: SmileyCharacter,
    ) => string;
};

export function resolveLatestChatSession(
    sourceChat: ChatSession,
    activeChat: ChatSession | undefined,
    sessionsById: ReadonlyMap<string, ChatSession>,
) {
    return activeChat?.id === sourceChat.id
        ? activeChat
        : (sessionsById.get(sourceChat.id) ?? sourceChat);
}

export function useMessageOperations({
    character,
    latestChatRef,
    onChatChange,
    persona,
    resolveChatMacros,
}: UseMessageOperationsOptions) {
    const latestSessionsByIdRef = useRef(new Map<string, ChatSession>());

    function updateChatMessages(
        messages: Message[],
        sourceChat = latestChatRef.current,
        messageUpdateKind?: MessageUpdateKind,
    ) {
        if (!sourceChat) {
            return undefined;
        }

        const nextMessages = messageUpdateKind
            ? applyMessageUpdateMiddlewares(messages, sourceChat, messageUpdateKind)
            : messages;

        const nextChat = {
            ...sourceChat,
            messages: nextMessages,
            updatedAt: new Date().toISOString(),
        };

        if (latestChatRef.current?.id === nextChat.id) {
            latestChatRef.current = nextChat;
        }
        latestSessionsByIdRef.current.set(nextChat.id, nextChat);
        onChatChange(nextChat);
        return nextChat;
    }

    function currentOrSourceChat(sourceChat: ChatSession) {
        return resolveLatestChatSession(
            sourceChat,
            latestChatRef.current,
            latestSessionsByIdRef.current,
        );
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
            files?: Array<File | { file: File; description?: string }>;
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

        const files = options.files ?? [];
        let attachments: ChatAttachment[] | undefined;
        if (files.length) {
            const rawFiles = files.map((item) =>
                item instanceof File ? item : item.file,
            );
            const uploaded = await uploadMessageAttachments(sourceChat.id, rawFiles);
            attachments = uploaded.map((att, idx) => {
                const item = files[idx];
                const description =
                    !(item instanceof File) && item.description?.trim()
                        ? item.description.trim()
                        : undefined;
                return description ? { ...att, description } : att;
            });
        }
        const message = createInjectedMessage(role, text, {
            activeCharacter: character,
            authorName: options.authorName,
            avatarPath: options.avatarPath,
            includeInPrompt: options.includeInPrompt,
            persona,
            pluginId: options.pluginId,
            promptRole: options.promptRole,
        });

        updateChatMessages(
            [
                ...sourceChat.messages,
                attachments?.length
                    ? updateActiveSwipeAttachments(message, attachments)
                    : message,
            ],
            sourceChat,
        );
    }

    async function deleteMessage(messageId: string) {
        const sourceChat = latestChatRef.current;

        if (!sourceChat) {
            return;
        }

        const message = sourceChat.messages.find((item) => item.id === messageId);

        if (message) {
            const attachments = Array.from(
                new Map(
                    message.swipes
                        .flatMap((swipe) => swipe.attachments ?? [])
                        .map((attachment) => [attachment.url, attachment]),
                ).values(),
            );
            const result = await deleteLocalChatAttachments(sourceChat.id, attachments);

            if (result.failedAttachments.length) {
                clientLogger.warn("Could not delete message attachments", {
                    chatId: sourceChat.id,
                    messageId,
                    failedCount: result.failedAttachments.length,
                });
            }
        }

        const targetChat = currentOrSourceChat(sourceChat);
        updateChatMessages(
            targetChat.messages.filter((message) => message.id !== messageId),
            targetChat,
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
                    ? setActiveSwipePendingToolContinuation(
                          updateActiveSwipeContent(
                              message,
                              resolveChatMacros(
                                  content,
                                  sourceChat.messages.filter(
                                      (item) => item.id !== messageId,
                                  ),
                              ),
                              undefined,
                              "",
                          ),
                          undefined,
                      )
                    : message,
            ),
            sourceChat,
            "edit",
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
            "swipe",
        );
    }

    function activateNextExistingSwipe(messageId: string, sourceChat: ChatSession) {
        const targetMessage = sourceChat.messages.find(
            (message) => message.id === messageId,
        );

        if (
            !targetMessage ||
            targetMessage.activeSwipeIndex >= targetMessage.swipes.length - 1
        ) {
            return false;
        }

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
            "swipe",
        );
        return true;
    }

    function appendEmptySwipe(messageId: string, sourceChat: ChatSession) {
        return updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId ? appendMessageSwipe(message, "") : message,
            ),
            sourceChat,
            "swipe",
        );
    }

    function appendSwipe(
        messageId: string,
        content: string,
        status?: Message["swipes"][number]["status"],
        reasoning?: string,
        reasoningDetails?: unknown,
        sourceChat = latestChatRef.current,
        toolActivities?: Message["swipes"][number]["toolActivities"],
        timeline?: Message["swipes"][number]["timeline"],
        pendingToolContinuation?: Message["swipes"][number]["pendingToolContinuation"],
    ) {
        if (!sourceChat) {
            return;
        }

        return updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? appendMessageSwipe(
                          message,
                          content,
                          status,
                          reasoning,
                          reasoningDetails,
                          toolActivities,
                          timeline,
                          pendingToolContinuation,
                      )
                    : message,
            ),
            sourceChat,
            "swipe",
        );
    }

    function updateMessageContent(
        messageId: string,
        content: string,
        status?: Message["swipes"][number]["status"],
        reasoning?: string,
        reasoningDetails?: unknown,
        toolActivities?: Message["swipes"][number]["toolActivities"],
        timeline?: Message["swipes"][number]["timeline"],
        pendingToolContinuation?:
            | Message["swipes"][number]["pendingToolContinuation"]
            | null,
        sourceChat = latestChatRef.current,
    ) {
        if (!sourceChat) {
            return undefined;
        }

        const nextChat = updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? (() => {
                          const updated = updateActiveSwipeContent(
                              message,
                              content,
                              status,
                              reasoning,
                              reasoningDetails,
                              toolActivities,
                              timeline,
                          );
                          return pendingToolContinuation === undefined
                              ? updated
                              : setActiveSwipePendingToolContinuation(
                                    updated,
                                    pendingToolContinuation ?? undefined,
                                );
                      })()
                    : message,
            ),
            sourceChat,
            "update",
        );
        finalizeStreamingMessageDraft(messageId);
        return nextChat;
    }

    function updateMessageReasoning(
        messageId: string,
        reasoning: string,
        reasoningDetails?: unknown,
        sourceChat = latestChatRef.current,
    ) {
        if (!sourceChat) {
            return undefined;
        }

        const nextChat = updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeReasoning(message, reasoning, reasoningDetails)
                    : message,
            ),
            sourceChat,
            "update",
        );
        finalizeStreamingMessageDraft(messageId);
        return nextChat;
    }

    function updateMessageAttachments(
        messageId: string,
        attachments: ChatAttachment[],
        sourceChat = latestChatRef.current,
    ) {
        if (!sourceChat) {
            return undefined;
        }

        const nextChat = updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? updateActiveSwipeAttachments(message, attachments)
                    : message,
            ),
            sourceChat,
            "update",
        );
        finalizeStreamingMessageDraft(messageId);
        return nextChat;
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

                return removeActiveMessageSwipe(message);
            }),
            sourceChat,
            "update",
        );
        clearStreamingMessageDraft(messageId);
    }

    function commitStreamingDraft(messageId: string, sourceChat = latestChatRef.current) {
        if (!sourceChat) {
            return false;
        }

        flushStreamingMessageDraft(messageId);
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
            "update",
        );
        finalizeStreamingMessageDraft(messageId);
        return true;
    }

    return {
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
        updateMessageReasoning,
    };
}

function applyMessageUpdateMiddlewares(
    messages: Message[],
    sourceChat: ChatSession,
    kind: MessageUpdateKind,
) {
    const middlewares = getMessageUpdateMiddlewares();

    if (middlewares.length === 0) {
        return messages;
    }

    const previousMessages = new Map(
        sourceChat.messages.map((message) => [message.id, message]),
    );

    return messages.map((message) => {
        const previousMessage = previousMessages.get(message.id);

        if (!previousMessage || previousMessage === message) {
            return message;
        }

        let nextMessage = message;

        for (const middleware of middlewares) {
            try {
                const replacement = middleware(nextMessage, {
                    chat: sourceChat,
                    previousMessage,
                    kind,
                });

                if (replacement !== undefined) {
                    if (replacement.id !== message.id) {
                        clientLogger.warn(
                            "Plugin message update middleware cannot change a message ID",
                        );
                        continue;
                    }
                    nextMessage = replacement;
                }
            } catch (error) {
                clientLogger.warn("Plugin message update middleware failed", error);
            }
        }

        return nextMessage;
    });
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

    return nextMessage;
}

function finalizeStreamingMessageDraft(messageId: string) {
    requestAnimationFrame(() => clearStreamingMessageDraft(messageId));
}
import { useRef } from "preact/hooks";
