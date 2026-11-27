import { describe, expect, test } from "bun:test";

import {
    chatToSummary,
    normalizeChat,
    normalizeChatSummaryCollection,
    sortChatsByInteraction,
} from "./normalize";
import type { ChatSession, ChatSummary } from "./types";

describe("normalizeChatSummaryCollection", () => {
    const directChat: ChatSummary = {
        id: "chat-direct-1",
        characterId: "char-1",
        defaultTitle: "Chat with Character 1",
        mode: "chat",
        messageCount: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const groupChat: ChatSummary = {
        id: "chat-group-1",
        kind: "group",
        characterId: "char-1",
        members: [
            { characterId: "char-1", name: "Char 1", order: 0 },
            { characterId: "char-2", name: "Char 2", order: 1 },
        ],
        defaultTitle: "Group: Char 1, Char 2",
        mode: "chat",
        messageCount: 5,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
    };

    test("preserves lastActiveChatId when pointing to a valid group chat", () => {
        const collection = normalizeChatSummaryCollection({
            version: 1,
            activeChatIdsByCharacter: { "char-1": "chat-direct-1" },
            lastActiveChatId: "chat-group-1",
            chats: [directChat, groupChat],
        });

        expect(collection.lastActiveChatId).toBe("chat-group-1");
        expect(collection.activeChatIdsByCharacter["char-1"]).toBe("chat-direct-1");
    });

    test("preserves lastActiveChatId when pointing to a valid direct chat", () => {
        const collection = normalizeChatSummaryCollection({
            version: 1,
            activeChatIdsByCharacter: { "char-1": "chat-direct-1" },
            lastActiveChatId: "chat-direct-1",
            chats: [directChat, groupChat],
        });

        expect(collection.lastActiveChatId).toBe("chat-direct-1");
    });

    test("drops lastActiveChatId when it does not exist in chats", () => {
        const collection = normalizeChatSummaryCollection({
            version: 1,
            activeChatIdsByCharacter: { "char-1": "chat-direct-1" },
            lastActiveChatId: "chat-nonexistent",
            chats: [directChat, groupChat],
        });

        expect(collection.lastActiveChatId).toBeUndefined();
    });

    test("does not map group chats into activeChatIdsByCharacter", () => {
        const collection = normalizeChatSummaryCollection({
            version: 1,
            activeChatIdsByCharacter: { "char-1": "chat-group-1" },
            chats: [directChat, groupChat],
        });

        // "chat-group-1" should be rejected for activeChatIdsByCharacter because it is a group chat
        expect(collection.activeChatIdsByCharacter["char-1"]).toBe("chat-direct-1");
    });
});

describe("normalizeChat", () => {
    test("stabilizes numeric photo placeholders during persistence normalization", () => {
        const chat = normalizeChat({
            id: "chat-1",
            characterId: "char-1",
            mode: "chat",
            messages: [
                {
                    id: "message-1",
                    role: "user",
                    author: "Anon",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    activeSwipeIndex: 0,
                    swipes: [
                        {
                            id: "swipe-1",
                            content: "First {{photo[1]}} then {{photo[0]}}",
                            createdAt: "2026-01-01T00:00:00.000Z",
                            attachments: [
                                { id: "photo-a", type: "image", url: "/a.png" },
                                { id: "photo-b", type: "image", url: "/b.png" },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(chat?.messages[0]?.swipes[0]?.content).toBe(
            "First {{photo:id=photo-b}} then {{photo:id=photo-a}}",
        );
    });

    test("keeps lastInteractionAt through normalization and summary conversion", () => {
        const chat = normalizeChat({
            id: "chat-1",
            characterId: "char-1",
            mode: "chat",
            lastInteractionAt: "2026-01-03T10:00:00.000Z",
            messages: [],
        }) as ChatSession;

        expect(chat.lastInteractionAt).toBe("2026-01-03T10:00:00.000Z");
        expect(chatToSummary(chat).lastInteractionAt).toBe("2026-01-03T10:00:00.000Z");
    });
});

describe("sortChatsByInteraction", () => {
    function summary(
        id: string,
        lastInteractionAt: string | undefined,
        lastMessageAt: string,
    ): ChatSummary {
        return {
            id,
            characterId: "char-1",
            defaultTitle: id,
            mode: "chat",
            messageCount: 1,
            lastMessageAt,
            ...(lastInteractionAt ? { lastInteractionAt } : {}),
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: lastMessageAt,
        };
    }

    test("orders by interaction time, not by the last message", () => {
        const sorted = sortChatsByInteraction([
            summary(
                "old-interaction",
                "2026-01-02T00:00:00.000Z",
                "2026-01-05T00:00:00.000Z",
            ),
            summary(
                "recent-swipe",
                "2026-01-06T00:00:00.000Z",
                "2026-01-02T00:00:00.000Z",
            ),
        ]);

        expect(sorted.map((chat) => chat.id)).toEqual([
            "recent-swipe",
            "old-interaction",
        ]);
    });

    test("falls back to the last message for chats written before the field", () => {
        const sorted = sortChatsByInteraction([
            summary("older", undefined, "2026-01-02T00:00:00.000Z"),
            summary("newer", undefined, "2026-01-04T00:00:00.000Z"),
        ]);

        expect(sorted.map((chat) => chat.id)).toEqual(["newer", "older"]);
    });
});
