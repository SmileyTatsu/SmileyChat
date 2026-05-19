import { describe, expect, test } from "bun:test";

import type { Message } from "#frontend/types";

import { createLorebookPromptInjections } from "./engine";
import type { Lorebook } from "./types";

describe("lorebook activation engine", () => {
    test("activates keyword entries from recent message text", () => {
        const injections = createLorebookPromptInjections(
            [
                lorebook({
                    keys: ["ObeyMe"],
                    content: "The ObeyMe app is installed.",
                }),
            ],
            {
                generation: {
                    activeCharacterId: "char-1",
                    stream: false,
                    trigger: "send",
                },
                messages: [message("user", "Open ObeyMe.")],
            },
        );

        expect(injections).toHaveLength(1);
        expect(injections[0].content).toBe("The ObeyMe app is installed.");
        expect(injections[0].anchor).toBe("after-character");
    });

    test("does not activate disabled entries", () => {
        const injections = createLorebookPromptInjections(
            [
                lorebook({
                    enabled: false,
                    keys: ["ObeyMe"],
                    content: "Disabled.",
                }),
            ],
            {
                generation: {
                    activeCharacterId: "char-1",
                    stream: false,
                    trigger: "send",
                },
                messages: [message("user", "Open ObeyMe.")],
            },
        );

        expect(injections).toHaveLength(0);
    });

    test("maps at-depth and outlet entries to prompt injection placement", () => {
        const injections = createLorebookPromptInjections(
            [
                lorebook({
                    keys: ["depth"],
                    position: "at-depth",
                    depth: 2,
                    content: "Depth lore.",
                }),
                lorebook({
                    keys: ["outlet"],
                    position: "outlet",
                    outletName: "World",
                    content: "Outlet lore.",
                }),
            ],
            {
                generation: {
                    activeCharacterId: "char-1",
                    stream: false,
                    trigger: "send",
                },
                messages: [message("user", "depth outlet")],
            },
        );

        expect(injections.map((injection) => injection.anchor)).toEqual([
            "at-depth",
            "outlet",
        ]);
        expect(injections[0].depth).toBe(2);
        expect(injections[1].outletName).toBe("World");
    });
});

function lorebook(entry: Partial<Lorebook["entries"][number]>): Lorebook {
    return {
        id: "book-1",
        version: 1,
        title: "Book",
        description: "",
        settings: {
            scanDepth: 4,
            tokenBudget: { mode: "percent", value: 25 },
            includeNames: true,
            recursive: false,
            maxRecursionSteps: 2,
            minActivations: 0,
            minActivationsMaxDepth: 0,
            caseSensitive: false,
            matchWholeWords: false,
            useGroupScoring: false,
            insertionStrategy: "sorted-evenly",
            overflowAlert: true,
        },
        entries: [
            {
                id: "entry-1",
                enabled: true,
                title: "Entry",
                keys: [],
                secondaryKeys: [],
                selectiveLogic: "and-any",
                content: "",
                strategy: "keyword",
                insertionOrder: 10,
                position: "after-char",
                role: "system",
                depth: 4,
                outletName: "",
                probability: 100,
                useProbability: false,
                inclusionGroups: [],
                groupWeight: 100,
                prioritizeInclusion: false,
                recursive: {
                    exclude: false,
                    preventFurther: false,
                    delayUntilRecursion: 0,
                },
                matchSources: {
                    personaDescription: false,
                    characterDescription: false,
                    characterPersonality: false,
                    characterNotes: false,
                    scenario: false,
                    creatorNotes: false,
                },
                timedEffects: {
                    sticky: 0,
                    cooldown: 0,
                    delay: 0,
                },
                characterFilter: {
                    mode: "include",
                    names: [],
                    tags: [],
                },
                triggers: [],
                automationId: "",
                ignoreBudget: false,
                extensions: {},
                ...entry,
            },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function message(role: Message["role"], content: string): Message {
    return {
        id: "message-1",
        author: role === "user" ? "Anon" : "Character",
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "swipe-1",
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
