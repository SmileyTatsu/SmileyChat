import { describe, expect, test } from "bun:test";

import type { ChatSession, Message } from "#frontend/types";

import { rewriteMessageAttachmentUrls } from "./chat-assets";
import { createForkedChatDraft } from "./chat-store";
import { BadRequestError } from "./http";

describe("chat forking", () => {
    test("creates a fork through the selected message and preserves group fields", () => {
        const sourceChat = createSourceChat();
        const fork = createForkedChatDraft({
            forkId: "chat_fork",
            messageId: "message_2",
            now: "2026-06-25T10:30:00.000Z",
            sourceChat,
        });

        expect(fork.id).toBe("chat_fork");
        expect(fork.id).not.toBe(sourceChat.id);
        expect(fork.createdAt).toBe("2026-06-25T10:30:00.000Z");
        expect(fork.updatedAt).toBe("2026-06-25T10:30:00.000Z");
        expect(fork.defaultTitle).toBe("Fork of Source title");
        expect(fork.title).toBeUndefined();
        expect(fork.kind).toBe("group");
        expect(fork.characterId).toBe(sourceChat.characterId);
        expect(fork.members).toEqual(sourceChat.members);
        expect(fork.group).toEqual(sourceChat.group);
        expect(fork.mode).toBe("rp");
        expect(fork.metadata).toEqual(sourceChat.metadata);
        expect(fork.messages.map((message) => message.id)).toEqual([
            "message_1",
            "message_2",
        ]);
    });

    test("rejects a missing target message", () => {
        expect(() =>
            createForkedChatDraft({
                forkId: "chat_fork",
                messageId: "missing",
                now: "2026-06-25T10:30:00.000Z",
                sourceChat: createSourceChat(),
            }),
        ).toThrow(BadRequestError);
    });

    test("rewrites copied source chat attachment urls to the fork chat", () => {
        const copiedFiles = new Set<string>();
        const messages = rewriteMessageAttachmentUrls(
            "chat_source",
            "chat_fork",
            [
                createMessage("message_1", [
                    {
                        id: "image.png",
                        type: "image",
                        url: "/api/chats/chat_source/attachments/image.png",
                        name: "image.png",
                    },
                    {
                        id: "document.pdf",
                        type: "file",
                        url: "/api/chats/chat_source/attachments/document.pdf",
                        name: "document.pdf",
                        mimeType: "application/pdf",
                    },
                    {
                        id: "external",
                        type: "file",
                        url: "https://example.com/document.pdf",
                    },
                ]),
            ],
            copiedFiles,
        );

        expect(messages[0].swipes[0].attachments?.[0]?.url).toBe(
            "/api/chats/chat_fork/attachments/image.png",
        );
        expect(messages[0].swipes[0].attachments?.[1]?.url).toBe(
            "/api/chats/chat_fork/attachments/document.pdf",
        );
        expect(messages[0].swipes[0].attachments?.[2]?.url).toBe(
            "https://example.com/document.pdf",
        );
        expect(Array.from(copiedFiles)).toEqual(["image.png", "document.pdf"]);
    });
});

function createSourceChat(): ChatSession {
    return {
        id: "chat_source",
        version: 1,
        kind: "group",
        characterId: "char_1",
        members: [
            { characterId: "char_1", name: "Ari", order: 0 },
            { characterId: "char_2", name: "Bea", order: 1, muted: true },
        ],
        group: {
            avatar: { type: "collage" },
            autoResponses: {
                enabled: true,
                chance: 0.5,
                delayMs: 1000,
                maxTurns: 2,
            },
            generationMode: "swap-character-cards",
            replyOrder: "natural",
            scenarioOverride: "Rainy night.",
        },
        defaultTitle: "Default source title",
        title: "Source title",
        mode: "rp",
        metadata: {
            authorNote: {
                content: "Keep the scene tense.",
                isEnabled: true,
            },
            lorebookIds: ["lore_1"],
        },
        messages: [
            createMessage("message_1"),
            createMessage("message_2"),
            createMessage("message_3"),
        ],
        createdAt: "2026-06-24T10:00:00.000Z",
        updatedAt: "2026-06-24T10:10:00.000Z",
    };
}

function createMessage(
    id: string,
    attachments: Message["swipes"][number]["attachments"] = [],
): Message {
    return {
        id,
        author: id === "message_1" ? "Anon" : "Ari",
        role: id === "message_1" ? "user" : "character",
        createdAt: "2026-06-24T10:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${id}_swipe`,
                content: `Content for ${id}`,
                ...(attachments.length ? { attachments } : {}),
                createdAt: "2026-06-24T10:00:00.000Z",
            },
        ],
    };
}
