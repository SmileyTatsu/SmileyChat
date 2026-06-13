import { useEffect, useRef } from "preact/hooks";

import { saveChat } from "#frontend/lib/api/client";
import { chatToSummary, normalizeChat } from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import type { ChatSession, ChatSummary, ChatSummaryCollection } from "#frontend/types";

type MutableRef<T> = {
    current: T;
};

type UseChatAutosaveOptions = {
    latestChatRef: MutableRef<ChatSession | undefined>;
    setActiveChat: (chat: ChatSession | undefined) => void;
    setChatLoadError: (message: string) => void;
    setChatSummaries: (summaries: ChatSummaryCollection) => void;
    updateChatSummary: (summary: ChatSummary) => void;
};

export function useChatAutosave({
    latestChatRef,
    setActiveChat,
    setChatLoadError,
    setChatSummaries,
    updateChatSummary,
}: UseChatAutosaveOptions) {
    const chatAutosaveTimerRef = useRef<number | undefined>(undefined);
    const chatSaveRequestIdRef = useRef(0);

    useEffect(
        () => () => {
            clearPendingChatAutosave();
        },
        [],
    );

    function queueChatSave(nextChat: ChatSession) {
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        const isActiveChat = safeChat.id === latestChatRef.current?.id;

        if (isActiveChat) {
            setActiveChat(safeChat);
        }
        updateChatSummary(chatToSummary(safeChat));
        setChatLoadError("");
        chatSaveRequestIdRef.current += 1;

        clearPendingChatAutosave();
        chatAutosaveTimerRef.current = window.setTimeout(() => {
            chatAutosaveTimerRef.current = undefined;
            void persistChat(safeChat, false);
        }, 450);
    }

    function clearPendingChatAutosave() {
        if (chatAutosaveTimerRef.current) {
            window.clearTimeout(chatAutosaveTimerRef.current);
            chatAutosaveTimerRef.current = undefined;
        }
    }

    async function flushPendingChatAutosaveWithoutStateUpdate() {
        if (!chatAutosaveTimerRef.current || !latestChatRef.current) {
            return;
        }

        const pendingChat = latestChatRef.current;
        clearPendingChatAutosave();
        await persistChat(pendingChat, false);
    }

    async function persistChat(nextChat: ChatSession, updateState = true) {
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        const requestId = chatSaveRequestIdRef.current + 1;
        chatSaveRequestIdRef.current = requestId;

        if (updateState) {
            setActiveChat(safeChat);
            updateChatSummary(chatToSummary(safeChat));
        }

        try {
            const result = (await saveChat(safeChat)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const savedChat = normalizeChat(result.chat) ?? safeChat;

            if (requestId === chatSaveRequestIdRef.current) {
                if (updateState || savedChat.id === latestChatRef.current?.id) {
                    setActiveChat(savedChat);
                }
                if (result.chats) {
                    setChatSummaries(result.chats);
                } else {
                    updateChatSummary(chatToSummary(savedChat));
                }
                setChatLoadError("");
            }
        } catch (error) {
            if (requestId === chatSaveRequestIdRef.current) {
                setChatLoadError(messageFromError(error));
            }
        }
    }

    return {
        clearPendingChatAutosave,
        flushPendingChatAutosaveWithoutStateUpdate,
        persistChat,
        queueChatSave,
    };
}
