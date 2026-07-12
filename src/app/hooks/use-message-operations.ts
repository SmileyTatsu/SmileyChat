import {
    appendMessageSwipe,
    createInjectedMessage,
    updateActiveSwipeAttachments,
    updateActiveSwipeContent,
    updateActiveSwipeReasoning,
    getMessageContent,
} from "#frontend/lib/messages";
import {
    clearStreamingMessageDraft,
    getStreamingMessageDraft,
    hasStreamingMessageDraftValue,
    type StreamingMessageDraft,
} from "#frontend/lib/streaming-message-drafts";
import { getMessageUpdateMiddlewares } from "#frontend/lib/plugins/registry";
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

export function useMessageOperations({
    character,
    latestChatRef,
    onChatChange,
    persona,
    resolveChatMacros,
}: UseMessageOperationsOptions) {
    function updateChatMessages(
        messages: Message[],
        sourceChat = latestChatRef.current,
        messageUpdateKind?: MessageUpdateKind,
    ) {
        if (!sourceChat) {
            return;
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
        onChatChange(nextChat);
    }

    function currentOrSourceChat(sourceChat: ChatSession) {
        return latestChatRef.current?.id === sourceChat.id
            ? latestChatRef.current
            : sourceChat;
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
        updateChatMessages(
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
    ) {
        if (!sourceChat) {
            return;
        }

        updateChatMessages(
            sourceChat.messages.map((message) =>
                message.id === messageId
                    ? appendMessageSwipe(
                          message,
                          content,
                          status,
                          reasoning,
                          reasoningDetails,
                          toolActivities,
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
                          toolActivities,
                      )
                    : message,
            ),
            sourceChat,
            "update",
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
            "update",
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
            "update",
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
            "update",
        );
        clearStreamingMessageDraft(messageId);
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
                        console.warn(
                            "Plugin message update middleware cannot change a message ID.",
                        );
                        continue;
                    }
                    nextMessage = replacement;
                }
            } catch (error) {
                console.warn("Plugin message update middleware failed:", error);
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
