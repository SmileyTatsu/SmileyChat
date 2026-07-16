import { useEffect, useRef } from "preact/hooks";

import { saveChat, saveChatWithKeepAlive } from "#frontend/lib/api/client";
import { chatToSummary } from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import type { ChatSession, ChatSummary, ChatSummaryCollection } from "#frontend/types";

import { createLatestSaveQueue, type LatestSaveQueue } from "./latest-save-queue";

type MutableRef<T> = {
    current: T;
};

type UseChatAutosaveOptions = {
    latestChatRef: MutableRef<ChatSession | undefined>;
    latestChatSummariesRef: MutableRef<ChatSummaryCollection>;
    setActiveChat: (chat: ChatSession | undefined) => void;
    setChatLoadError: (message: string) => void;
    updateChatSummary: (summary: ChatSummary) => void;
};

type SaveResult = {
    summary: ChatSummary;
};

const autosaveDelayMs = 450;

export function useChatAutosave({
    latestChatRef,
    latestChatSummariesRef,
    setActiveChat,
    setChatLoadError,
    updateChatSummary,
}: UseChatAutosaveOptions) {
    const autosaveTimersRef = useRef(new Map<string, number>());
    const scheduledChatsRef = useRef(new Map<string, ChatSession>());
    const saveQueuesRef = useRef(new Map<string, LatestSaveQueue<ChatSession>>());

    useEffect(() => {
        function flushBeforePageHide() {
            clearPendingChatAutosaveTimers();

            const pendingChats = new Map(scheduledChatsRef.current);
            scheduledChatsRef.current.clear();

            for (const [chatId, queue] of saveQueuesRef.current) {
                const pendingChat = queue.getLatestPendingValue();
                if (pendingChat) {
                    pendingChats.set(chatId, pendingChat);
                }
            }

            for (const chat of pendingChats.values()) {
                void saveChatWithKeepAlive(chat).catch((error) => {
                    console.warn("Could not persist chat before unload:", error);
                });
            }
        }

        window.addEventListener("pagehide", flushBeforePageHide);

        return () => {
            window.removeEventListener("pagehide", flushBeforePageHide);
            clearPendingChatAutosave();
        };
    }, []);

    function queueChatSave(nextChat: ChatSession) {
        updateLocalChatState(nextChat, true);
        setChatLoadError("");
        scheduledChatsRef.current.set(nextChat.id, nextChat);
        clearPendingChatAutosaveTimer(nextChat.id);
        autosaveTimersRef.current.set(
            nextChat.id,
            window.setTimeout(() => {
                autosaveTimersRef.current.delete(nextChat.id);
                const scheduledChat = scheduledChatsRef.current.get(nextChat.id);
                scheduledChatsRef.current.delete(nextChat.id);

                if (scheduledChat) {
                    void enqueueChatSave(scheduledChat);
                }
            }, autosaveDelayMs),
        );
    }

    function clearPendingChatAutosave() {
        clearPendingChatAutosaveTimers();
        scheduledChatsRef.current.clear();
    }

    function clearPendingChatAutosaveTimers() {
        for (const timer of autosaveTimersRef.current.values()) {
            window.clearTimeout(timer);
        }
        autosaveTimersRef.current.clear();
    }

    function clearPendingChatAutosaveTimer(chatId: string) {
        const timer = autosaveTimersRef.current.get(chatId);
        if (timer !== undefined) {
            window.clearTimeout(timer);
            autosaveTimersRef.current.delete(chatId);
        }
    }

    async function flushPendingChatAutosaveWithoutStateUpdate() {
        clearPendingChatAutosaveTimers();

        const scheduledChats = Array.from(scheduledChatsRef.current.values());
        scheduledChatsRef.current.clear();

        await Promise.all([
            ...scheduledChats.map((chat) => enqueueChatSave(chat)),
            ...Array.from(saveQueuesRef.current.values(), (queue) => queue.flush()),
        ]);
    }

    async function persistChat(nextChat: ChatSession, updateState = true) {
        clearPendingChatAutosaveTimer(nextChat.id);
        scheduledChatsRef.current.delete(nextChat.id);

        if (updateState) {
            updateLocalChatState(nextChat, true);
        }

        await enqueueChatSave(nextChat);
    }

    function enqueueChatSave(chat: ChatSession) {
        return getSaveQueue(chat.id).enqueue(chat);
    }

    function getSaveQueue(chatId: string) {
        const existing = saveQueuesRef.current.get(chatId);
        if (existing) {
            return existing;
        }

        const queue = createLatestSaveQueue<ChatSession, SaveResult>({
            save: (chat) => saveChat(chat),
            onSaved: (_chat, result) => {
                if (
                    shouldApplySavedChatSummary(
                        result.summary,
                        latestChatRef.current,
                        latestChatSummariesRef.current,
                    )
                ) {
                    updateChatSummary(result.summary);
                }
                setChatLoadError("");
            },
            onError: (error) => {
                setChatLoadError(messageFromError(error));
            },
        });

        saveQueuesRef.current.set(chatId, queue);
        return queue;
    }

    function updateLocalChatState(chat: ChatSession, updateActiveChat: boolean) {
        if (updateActiveChat && chat.id === latestChatRef.current?.id) {
            setActiveChat(chat);
        }
        updateChatSummary(chatToSummary(chat));
    }

    return {
        clearPendingChatAutosave,
        flushPendingChatAutosaveWithoutStateUpdate,
        persistChat,
        queueChatSave,
    };
}

export function shouldApplySavedChatSummary(
    savedSummary: ChatSummary,
    activeChat: ChatSession | undefined,
    chatSummaries: ChatSummaryCollection,
) {
    const localSummary =
        activeChat?.id === savedSummary.id
            ? chatToSummary(activeChat)
            : chatSummaries.chats.find((chat) => chat.id === savedSummary.id);

    return (
        !localSummary ||
        Date.parse(savedSummary.updatedAt) >= Date.parse(localSummary.updatedAt)
    );
}
