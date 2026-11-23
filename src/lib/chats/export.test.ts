import { describe, expect, test } from "bun:test";

import { buildChatExportFileName, buildChatMarkdown } from "./export";
import type { ChatSession } from "./types";

function createChat(): ChatSession {
    return {
        id: "chat-1",
        version: 1,
        characterId: "luna",
        defaultTitle: "Luna: Night Walk",
        mode: "rp",
        createdAt: "2026-01-01T20:00:00.000Z",
        updatedAt: "2026-01-01T20:05:00.000Z",
        messages: [
            {
                id: "m1",
                author: "Luna",
                role: "character",
                createdAt: "2026-01-01T20:01:00.000Z",
                activeSwipeIndex: 0,
                swipes: [
                    {
                        id: "m1-s1",
                        content: "<msg>The wind rises.</msg><msg delay=\"1s\">Stay close.</msg>",
                        createdAt: "2026-01-01T20:01:00.000Z",
                    },
                ],
            },
            {
                id: "m2",
                author: "Anon",
                role: "user",
                createdAt: "2026-01-01T20:02:00.000Z",
                activeSwipeIndex: 0,
                swipes: [
                    {
                        id: "m2-s1",
                        content: "I will.",
                        createdAt: "2026-01-01T20:02:00.000Z",
                        attachments: [
                            {
                                id: "a1",
                                type: "image",
                                url: "/api/chats/chat-1/attachments/photo.png",
                                name: "photo.png",
                                mimeType: "image/png",
                                sizeBytes: 1024,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("chat export", () => {
    test("renders a readable markdown transcript", () => {
        const markdown = buildChatMarkdown(createChat(), "Luna");

        expect(markdown).toContain("# Luna: Night Walk");
        expect(markdown).toContain("- Character: Luna");
        expect(markdown).toContain("- Mode: Roleplaying / Storytelling");
        expect(markdown).toContain("**Luna** · 2026-01-01T20:01:00.000Z");
        expect(markdown).toContain("The wind rises.");
        expect(markdown).toContain("Stay close.");
        expect(markdown).not.toContain("<msg>");
        expect(markdown).toContain("- [image] photo.png");
        expect(markdown.endsWith("\n")).toBe(true);
    });

    test("builds a slugged file name that stays unique per chat", () => {
        expect(buildChatExportFileName(createChat(), "md")).toBe(
            "luna-night-walk-chat-1.md",
        );
    });
});
