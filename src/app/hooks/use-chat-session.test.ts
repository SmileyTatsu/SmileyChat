import { describe, expect, test } from "bun:test";

import type { ChatSession, Message } from "#frontend/types";

import { formatInterruptedGeneration, isMessageAuthorUnmuted } from "./use-chat-session";
import { resolveLatestChatSession } from "./use-message-operations";

test("uses a newer background session snapshot over a stale source session", () => {
    const deletedMessage: Message = {
        id: "message-deleted",
        author: "You",
        role: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "swipe-deleted",
                content: "Delete me.",
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
    const source: ChatSession = {
        id: "chat-background",
        version: 1,
        characterId: "char-luna",
        defaultTitle: "Chat with Luna",
        mode: "chat",
        messages: [deletedMessage],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const generatedMessage: Message = {
        id: "message-generated",
        author: "Luna",
        role: "character",
        createdAt: "2026-01-01T00:00:01.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "swipe-generated",
                content: "Generated while the chat was in the background.",
                createdAt: "2026-01-01T00:00:01.000Z",
            },
        ],
    };
    const latestBackgroundSession: ChatSession = {
        ...source,
        messages: [deletedMessage, generatedMessage],
        updatedAt: "2026-01-01T00:00:01.000Z",
    };

    const resolved = resolveLatestChatSession(
        source,
        undefined,
        new Map([[source.id, latestBackgroundSession]]),
    );

    expect(resolved).toBe(latestBackgroundSession);
    expect(
        resolved.messages.filter((message) => message.id !== deletedMessage.id),
    ).toEqual([generatedMessage]);
});

test("appends a background generation after a deleted message without resurrecting it", () => {
    const deletedMessage: Message = {
        id: "message-deleted",
        author: "You",
        role: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "swipe-deleted",
                content: "Delete me.",
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
    const source: ChatSession = {
        id: "chat-background",
        version: 1,
        characterId: "char-luna",
        defaultTitle: "Chat with Luna",
        mode: "chat",
        messages: [deletedMessage],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const generatedMessage: Message = {
        id: "message-generated",
        author: "Luna",
        role: "character",
        createdAt: "2026-01-01T00:00:01.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "swipe-generated",
                content: "This must not restore the deleted message.",
                createdAt: "2026-01-01T00:00:01.000Z",
            },
        ],
    };
    const postDeletionSession: ChatSession = {
        ...source,
        messages: [],
        updatedAt: "2026-01-01T00:00:01.000Z",
    };

    const target = resolveLatestChatSession(
        source,
        undefined,
        new Map([[source.id, postDeletionSession]]),
    );
    const completedMessages = [...target.messages, generatedMessage];

    expect(completedMessages).toEqual([generatedMessage]);
});

describe("isMessageAuthorUnmuted", () => {
    test("returns true for non-group chats", () => {
        const message: Message = {
            id: "msg-1",
            author: "Luna",
            authorCharacterId: "char-luna",
            role: "character",
            createdAt: new Date().toISOString(),
            activeSwipeIndex: 0,
            swipes: [{ id: "s-1", content: "Hi", createdAt: new Date().toISOString() }],
        };
        const directChat: ChatSession = {
            id: "chat-direct",
            version: 1,
            characterId: "char-luna",
            defaultTitle: "Chat with Luna",
            mode: "chat",
            messages: [message],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        expect(isMessageAuthorUnmuted(message, directChat)).toBe(true);
        expect(isMessageAuthorUnmuted(message, undefined)).toBe(true);
    });

    test("validates ID-first and does not let same-named unmuted member validate a muted author", () => {
        const messageFromMutedA: Message = {
            id: "msg-1",
            author: "Hero",
            authorCharacterId: "char-hero-1",
            role: "character",
            createdAt: new Date().toISOString(),
            activeSwipeIndex: 0,
            swipes: [
                {
                    id: "s-1",
                    content: "I am Hero 1",
                    createdAt: new Date().toISOString(),
                },
            ],
        };
        const groupChatSession: ChatSession = {
            id: "group-1",
            version: 1,
            kind: "group",
            characterId: "char-hero-1",
            members: [
                { characterId: "char-hero-1", name: "Hero", order: 0, muted: true },
                { characterId: "char-hero-2", name: "Hero", order: 1, muted: false },
            ],
            defaultTitle: "Heroes",
            mode: "chat",
            messages: [messageFromMutedA],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // char-hero-1 is muted, so even though char-hero-2 shares name "Hero" and is unmuted,
        // message from char-hero-1 must be recognized as muted!
        expect(isMessageAuthorUnmuted(messageFromMutedA, groupChatSession)).toBe(false);

        // When char-hero-1 is unmuted:
        groupChatSession.members![0].muted = false;
        expect(isMessageAuthorUnmuted(messageFromMutedA, groupChatSession)).toBe(true);
    });

    test("resolves by name when authorCharacterId is missing", () => {
        const legacyMessage: Message = {
            id: "msg-legacy",
            author: "Megumin",
            role: "character",
            createdAt: new Date().toISOString(),
            activeSwipeIndex: 0,
            swipes: [
                { id: "s-1", content: "Explosion!", createdAt: new Date().toISOString() },
            ],
        };
        const groupChatSession: ChatSession = {
            id: "group-1",
            version: 1,
            kind: "group",
            characterId: "char-megumin",
            members: [
                { characterId: "char-megumin", name: "Megumin", order: 0, muted: false },
            ],
            defaultTitle: "Group",
            mode: "chat",
            messages: [legacyMessage],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        expect(isMessageAuthorUnmuted(legacyMessage, groupChatSession)).toBe(true);

        groupChatSession.members![0].muted = true;
        expect(isMessageAuthorUnmuted(legacyMessage, groupChatSession)).toBe(false);
    });
});

describe("formatInterruptedGeneration", () => {
    test("keeps received streaming content and appends an interruption notice", () => {
        expect(
            formatInterruptedGeneration(
                "  A partial reply.  ",
                new Error("Connection lost"),
            ),
        ).toBe(
            "A partial reply.\n\n*[Generation interrupted during streaming: Connection lost]*",
        );
    });

    test("reports a generation failure when no streaming content was received", () => {
        expect(formatInterruptedGeneration(" \n\t", new Error("Request timed out"))).toBe(
            "Generation failed: Request timed out",
        );
    });
});
