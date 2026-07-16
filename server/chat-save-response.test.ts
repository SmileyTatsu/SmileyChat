import { describe, expect, test } from "bun:test";

import type { ChatSession } from "#frontend/types";

import { chatSaveResponse } from "./chat-save-response";
import { shouldPreserveExistingChat } from "./chat-store";

describe("chat save acknowledgement", () => {
    test("returns only a summary for the persisted chat", () => {
        const chat = createChat("2026-07-15T12:00:00.000Z", "Saved content");
        const response = chatSaveResponse(chat);

        expect(response).toEqual({
            ok: true,
            summary: {
                id: chat.id,
                characterId: chat.characterId,
                defaultTitle: chat.defaultTitle,
                mode: chat.mode,
                messageCount: 1,
                lastMessageAt: "2026-07-15T11:59:00.000Z",
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
            },
        });
        expect("chat" in response).toBeFalse();
        expect("chats" in response).toBeFalse();
    });

    test("preserves a newer stored chat over a stale incoming save", () => {
        const stored = createChat("2026-07-15T12:01:00.000Z", "Newer content");
        const incoming = createChat("2026-07-15T12:00:00.000Z", "Stale content");

        expect(shouldPreserveExistingChat(stored, incoming)).toBe(true);
        expect(shouldPreserveExistingChat(incoming, stored)).toBe(false);
    });
});

function createChat(updatedAt: string, content: string): ChatSession {
    return {
        id: "chat-save-response",
        version: 1,
        characterId: "character-1",
        defaultTitle: "Save response test",
        mode: "chat",
        messages: [
            {
                id: "message-1",
                author: "Anon",
                role: "user",
                createdAt: "2026-07-15T11:59:00.000Z",
                activeSwipeIndex: 0,
                swipes: [
                    {
                        id: "swipe-1",
                        content,
                        createdAt: "2026-07-15T11:59:00.000Z",
                    },
                ],
            },
        ],
        createdAt: "2026-07-15T11:58:00.000Z",
        updatedAt,
    };
}
