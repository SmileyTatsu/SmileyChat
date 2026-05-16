import { describe, expect, test } from "bun:test";

import { importSillyTavernChat } from "./import";

describe("SillyTavern chat import", () => {
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
