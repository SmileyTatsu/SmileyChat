import { useEffect, useRef } from "preact/hooks";

import { saveChat, saveChatWithKeepAlive } from "#frontend/lib/api/client";
import { chatToSummary, normalizeChat } from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import type { ChatSession, ChatSummary, ChatSummaryCollection } from "#frontend/types";

import { createLatestSaveQueue, type LatestSaveQueue } from "./latest-save-queue";

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

type SaveResult = {
    chat: ChatSession;
    chats?: ChatSummaryCollection;
};

const autosaveDelayMs = 450;

export function useChatAutosave({
    latestChatRef,
    setActiveChat,
    setChatLoadError,
    setChatSummaries,
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
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        updateLocalChatState(safeChat, true);
        setChatLoadError("");
        scheduledChatsRef.current.set(safeChat.id, safeChat);
        clearPendingChatAutosaveTimer(safeChat.id);
        autosaveTimersRef.current.set(
            safeChat.id,
            window.setTimeout(() => {
                autosaveTimersRef.current.delete(safeChat.id);
                const scheduledChat = scheduledChatsRef.current.get(safeChat.id);
                scheduledChatsRef.current.delete(safeChat.id);

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
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        clearPendingChatAutosaveTimer(safeChat.id);
        scheduledChatsRef.current.delete(safeChat.id);

        if (updateState) {
            updateLocalChatState(safeChat, true);
        }

        await enqueueChatSave(safeChat);
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
            save: async (chat) => {
                const result = (await saveChat(chat)) as SaveResult;
                return {
                    ...result,
                    chat: normalizeChat(result.chat) ?? chat,
                };
            },
            onSaved: (_chat, result) => {
                if (result.chat.id === latestChatRef.current?.id) {
                    setActiveChat(result.chat);
                }
                if (result.chats) {
                    setChatSummaries(result.chats);
                } else {
                    updateChatSummary(chatToSummary(result.chat));
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
