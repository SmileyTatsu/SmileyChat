import { describe, expect, test } from "bun:test";

import {
    messageTextForHistory,
    prefixMessageAuthor,
    stripLeadingSpeakerPrefix,
} from "./message-format";

describe("message-format helpers", () => {
    describe("prefixMessageAuthor", () => {
        test("prefixes author name when missing", () => {
            expect(prefixMessageAuthor("Luna", "Hello there")).toBe("Luna: Hello there");
            expect(prefixMessageAuthor("Anon", "How are you?")).toBe(
                "Anon: How are you?",
            );
        });

        test("does not double-prefix if author is already present", () => {
            expect(prefixMessageAuthor("Luna", "Luna: Hello there")).toBe(
                "Luna: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "Luna:Hello there")).toBe(
                "Luna:Hello there",
            );
            expect(prefixMessageAuthor("Luna", "  Luna: Hello there")).toBe(
                "  Luna: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "\nLuna: Hello there")).toBe(
                "\nLuna: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "<Luna>: Hello there")).toBe(
                "<Luna>: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "<Luna> Hello there")).toBe(
                "<Luna> Hello there",
            );
            expect(prefixMessageAuthor("Luna", "[Luna]: Hello there")).toBe(
                "[Luna]: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "(Luna): Hello there")).toBe(
                "(Luna): Hello there",
            );
            expect(prefixMessageAuthor("Luna", "**Luna**: Hello there")).toBe(
                "**Luna**: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "**Luna:** Hello there")).toBe(
                "**Luna:** Hello there",
            );
            expect(prefixMessageAuthor("Luna", "*Luna*: Hello there")).toBe(
                "*Luna*: Hello there",
            );
            expect(prefixMessageAuthor("Luna", "*Luna:* Hello there")).toBe(
                "*Luna:* Hello there",
            );
        });

        test("does not duplicate custom non-colon prefix if already present", () => {
            expect(
                prefixMessageAuthor("Luna", "### Luna\nHello there", "### Luna\n"),
            ).toBe("### Luna\nHello there");
            expect(
                prefixMessageAuthor("Luna", "\n### Luna\nHello there", "### Luna\n "),
            ).toBe("\n### Luna\nHello there");
            expect(
                prefixMessageAuthor(
                    "Luna",
                    "<speaker: Luna>\nHello there",
                    "<speaker: Luna>\n ",
                ),
            ).toBe("<speaker: Luna>\nHello there");
            expect(prefixMessageAuthor("Luna", "Hello there", "### Luna\n")).toBe(
                "### Luna\nHello there",
            );
        });

        test("handles empty values gracefully", () => {
            expect(prefixMessageAuthor("", "Hello")).toBe("Hello");
            expect(prefixMessageAuthor("Luna", "")).toBe("");
        });
    });

    describe("stripLeadingSpeakerPrefix", () => {
        test("strips exact character name prefix", () => {
            expect(stripLeadingSpeakerPrefix("Luna: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("Luna:\nHello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix('Luna: "Hello there!"', ["Luna"])).toBe(
                '"Hello there!"',
            );
            expect(stripLeadingSpeakerPrefix("  Luna: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("\n\nLuna: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
        });

        test("strips formatted name variants (bold, italic, brackets, parentheses)", () => {
            expect(stripLeadingSpeakerPrefix("**Luna**: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("**Luna:** Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(
                stripLeadingSpeakerPrefix("\n\n**Luna**: Hello there!", ["Luna"]),
            ).toBe("Hello there!");
            expect(stripLeadingSpeakerPrefix("*Luna*: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("*Luna:* Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("<Luna>: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("<Luna> Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("[Luna]: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("(Luna): Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
        });

        test("strips {{char}} and {{user}} macros", () => {
            expect(stripLeadingSpeakerPrefix("{{char}}: Hello there!", ["Luna"])).toBe(
                "Hello there!",
            );
            expect(stripLeadingSpeakerPrefix("{{user}}: Hello there!", ["Anon"])).toBe(
                "Hello there!",
            );
        });

        test("does not strip when name is part of narrative sentence", () => {
            expect(
                stripLeadingSpeakerPrefix("Luna walked into the room.", ["Luna"]),
            ).toBe("Luna walked into the room.");
            expect(stripLeadingSpeakerPrefix("Anon thought about it.", ["Anon"])).toBe(
                "Anon thought about it.",
            );
        });
    });

    describe("messageTextForHistory", () => {
        const userMsg = {
            id: "m1",
            author: "Anon",
            role: "user" as const,
            createdAt: "2026-01-01T00:00:00.000Z",
            activeSwipeIndex: 0,
            swipes: [
                { id: "s1", content: "Hello", createdAt: "2026-01-01T00:00:00.000Z" },
            ],
        };
        const charMsg = {
            id: "m2",
            author: "Luna",
            role: "character" as const,
            createdAt: "2026-01-01T00:00:00.000Z",
            activeSwipeIndex: 0,
            swipes: [{ id: "s2", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" }],
        };

        test("prefixes author when namesBehavior is 'always'", () => {
            const ctx = { formatting: { namesBehavior: "always" as const } };
            expect(messageTextForHistory(userMsg, ctx)).toBe("Anon: Hello");
            expect(messageTextForHistory(charMsg, ctx)).toBe("Luna: Hi");
        });

        test("omits prefix when namesBehavior is 'never'", () => {
            const ctx = { formatting: { namesBehavior: "never" as const } };
            expect(messageTextForHistory(userMsg, ctx)).toBe("Hello");
            expect(messageTextForHistory(charMsg, ctx)).toBe("Hi");
        });

        test("omits prefix in 1-on-1 chat when namesBehavior is 'force'", () => {
            const ctx = { formatting: { namesBehavior: "force" as const } };
            expect(messageTextForHistory(userMsg, ctx)).toBe("Hello");
            expect(messageTextForHistory(charMsg, ctx)).toBe("Hi");
        });

        test("handles custom non-colon group joinPrefix without duplication", () => {
            const groupCharMsg = {
                ...charMsg,
                authorCharacterId: "char-luna",
            };
            const groupCtx = {
                group: {
                    memberIds: ["char-luna", "char-sol"],
                    joinPrefix: "### {{char}}\n",
                },
                formatting: { namesBehavior: "force" as const },
            };

            // Prefixes when missing
            expect(messageTextForHistory(groupCharMsg, groupCtx, "Greetings!")).toBe(
                "### Luna\n Greetings!",
            );

            // Does not duplicate when already present
            expect(
                messageTextForHistory(groupCharMsg, groupCtx, "### Luna\nGreetings!"),
            ).toBe("### Luna\nGreetings!");
        });
    });
});
