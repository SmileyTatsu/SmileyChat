import { describe, expect, test } from "bun:test";

import { importSillyTavernChat } from "./import";

describe("SillyTavern chat import", () => {
    test("imports native SmileyChat chat JSON files", () => {
        const raw = JSON.stringify({
            id: "chat_from_other_install",
            version: 1,
            characterId: "old_character",
            defaultTitle: "Chat with Luna",
            mode: "rp",
            messages: [
                {
                    id: "character_1",
                    author: "Luna",
                    authorCharacterId: "old_character",
                    role: "character",
                    createdAt: "2026-02-08T21:57:00.000Z",
                    activeSwipeIndex: 1,
                    swipes: [
                        {
                            id: "swipe_1",
                            content: "First draft.",
                            createdAt: "2026-02-08T21:57:00.000Z",
                        },
                        {
                            id: "swipe_2",
                            content: "Second draft.",
                            createdAt: "2026-02-08T21:58:00.000Z",
                        },
                    ],
                },
                {
                    id: "user_1",
                    author: "Anon",
                    role: "user",
                    createdAt: "2026-02-08T22:19:00.000Z",
                    activeSwipeIndex: 0,
                    swipes: [
                        {
                            id: "swipe_3",
                            content: "Hello from the user.",
                            createdAt: "2026-02-08T22:19:00.000Z",
                        },
                    ],
                },
            ],
            createdAt: "2026-02-08T21:57:00.000Z",
            updatedAt: "2026-02-08T22:19:00.000Z",
        });

        const chat = importSillyTavernChat({
            raw,
            characterId: "new_character",
            sourceFileName: "chat-export.json",
        });

        expect(chat.id).not.toBe("chat_from_other_install");
        expect(chat.characterId).toBe("new_character");
        expect(chat.mode).toBe("rp");
        expect(chat.messages).toHaveLength(2);
        expect(chat.messages[0]).toMatchObject({
            author: "Luna",
            authorCharacterId: "new_character",
            role: "character",
            activeSwipeIndex: 1,
        });
        expect(chat.messages[0].swipes[1]).toMatchObject({
            content: "Second draft.",
        });
        expect(chat.messages[1]).toMatchObject({
            author: "Anon",
            role: "user",
        });
    });

    test("imports message-shaped rows even when SillyTavern marks them as system", () => {
        const raw = [
            JSON.stringify({
                user_name: "Anon",
                character_name: "Luna",
                chat_metadata: { integrity: "example" },
            }),
            JSON.stringify({
                name: "Luna",
                is_user: false,
                is_system: true,
                send_date: "February 8, 2026 3:57pm",
                mes: "Hello from the character.",
            }),
            JSON.stringify({
                name: "Anon",
                is_user: true,
                is_system: true,
                send_date: "February 8, 2026 4:19pm",
                mes: "Hello from the user.",
            }),
        ].join("\n");

        const chat = importSillyTavernChat({
            raw,
            characterId: "char_test",
            sourceFileName: "350_replies.jsonl",
        });

        expect(chat.messages).toHaveLength(2);
        expect(chat.messages[0]).toMatchObject({
            author: "Luna",
            role: "character",
            activeSwipeIndex: 0,
        });
        expect(chat.messages[0].swipes[0]).toMatchObject({
            content: "Hello from the character.",
        });
        expect(chat.messages[1]).toMatchObject({
            author: "Anon",
            role: "user",
            activeSwipeIndex: 0,
        });
        expect(chat.messages[1].swipes[0]).toMatchObject({
            content: "Hello from the user.",
        });
    });
});
