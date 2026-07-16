import { describe, expect, test } from "bun:test";

import type { ChatSession, ChatSummaryCollection } from "#frontend/types";

import { chatToSummary } from "#frontend/lib/chats/normalize";

import { shouldApplySavedChatSummary } from "./use-chat-autosave";

describe("chat save acknowledgements", () => {
    test("does not replace a newer optimistic summary with an older acknowledgement", () => {
        const localChat = createChat("2026-07-15T12:01:00.000Z", "Newer local edit");
        const savedChat = createChat("2026-07-15T12:00:00.000Z", "Older save");

        expect(
            shouldApplySavedChatSummary(
                chatToSummary(savedChat),
                localChat,
                collectionFor(localChat),
            ),
        ).toBe(false);
    });

    test("accepts a newer server summary for a non-active chat", () => {
        const localChat = createChat("2026-07-15T12:00:00.000Z", "Older local edit");
        const savedChat = createChat("2026-07-15T12:01:00.000Z", "Newer saved edit");

        expect(
            shouldApplySavedChatSummary(
                chatToSummary(savedChat),
                undefined,
                collectionFor(localChat),
            ),
        ).toBe(true);
    });
});

function collectionFor(chat: ChatSession): ChatSummaryCollection {
    return { version: 1, activeChatIdsByCharacter: {}, chats: [chatToSummary(chat)] };
}

function createChat(updatedAt: string, content: string): ChatSession {
    return {
        id: "chat-autosave",
        version: 1,
        characterId: "character-1",
        defaultTitle: "Autosave test",
        mode: "chat",
        messages: [
            {
                id: "message-1",
                author: "Anon",
                role: "user",
                createdAt: updatedAt,
                activeSwipeIndex: 0,
                swipes: [{ id: "swipe-1", content, createdAt: updatedAt }],
            },
        ],
        createdAt: updatedAt,
        updatedAt,
    };
}
