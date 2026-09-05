import { describe, expect, test } from "bun:test";

import { normalizeChatSummaryCollection } from "./normalize";
import type { ChatSummary } from "./types";

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
