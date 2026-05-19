import { describe, expect, test } from "bun:test";

import type {
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
} from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { createDefaultPreset } from "../presets/defaults";
import type { PromptBuildContext } from "./types";
import { buildPromptForGeneration } from "./build";

describe("buildPromptForGeneration", () => {
    test("counts structured injections before trimming history", async () => {
        const context = createPromptContext({
            messages: [
                message("m1", "user", "one ".repeat(120)),
                message("m2", "character", "two ".repeat(120)),
                message("m3", "user", "three ".repeat(120)),
            ],
            tokenBudget: 1200,
        });

        const result = await buildPromptForGeneration({
            context,
            injectors: [
                () => [
                    {
                        id: "lore-budget",
                        anchor: "before-history",
                        content: "lore ".repeat(160),
                        order: 0,
                        role: "system",
                        source: "lorebook",
                    },
                ],
            ],
        });

        expect(result.debug.budget.injectionTokens).toBeGreaterThan(0);
        expect(result.debug.trimmedMessageIds).toContain("m1");
        expect(result.messages.map((item) => item.id)).toEqual(["m3"]);
    });

    test("places at-depth injections relative to the selected history", async () => {
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages: [
                    message("m1", "user", "Hello"),
                    message("m2", "character", "Hi"),
                    message("m3", "user", "Remember this"),
                ],
                tokenBudget: 10000,
            }),
            injectors: [
                () => [
                    {
                        id: "depth-lore",
                        anchor: "at-depth",
                        content: "Depth lore",
                        depth: 0,
                        order: 0,
                        role: "system",
                        source: "lorebook",
                    },
                ],
            ],
        });
        const contents = result.promptMessages.map((item) =>
            typeof item.content === "string" ? item.content : "",
        );
        const depthIndex = contents.indexOf("Depth lore");
        const lastUserIndex = contents.indexOf("Remember this");

        expect(depthIndex).toBeGreaterThan(-1);
        expect(lastUserIndex).toBeGreaterThan(-1);
        expect(depthIndex).toBeLessThan(lastUserIndex);
    });

    test("renders outlet injections through outlet macros", async () => {
        const preset = createDefaultPreset("2026-01-01T00:00:00.000Z");
        const outletPrompt = {
            id: "outlet-prompt",
            title: "Outlet",
            role: "system" as const,
            content: "{{outlet::World}}",
            systemPrompt: false,
            marker: true,
            injectionPosition: "none" as const,
            injectionDepth: 0,
            forbidOverrides: false,
            anchor: "before-history" as const,
        };
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                preset: {
                    ...preset,
                    prompts: [...preset.prompts, outletPrompt],
                    promptOrder: [
                        ...preset.promptOrder,
                        { promptId: outletPrompt.id, enabled: true },
                    ],
                },
            }),
            injectors: [
                () => [
                    {
                        id: "outlet-lore",
                        anchor: "outlet",
                        content: "Outlet lore",
                        order: 0,
                        outletName: "World",
                        role: "system",
                        source: "lorebook",
                    },
                ],
            ],
        });

        expect(
            result.promptMessages.some((message) => message.content === "Outlet lore"),
        ).toBe(true);
    });
});

function createPromptContext(
    overrides: Partial<PromptBuildContext> = {},
): PromptBuildContext {
    const character = overrides.character ?? createCharacter();
    const persona = overrides.persona ?? createPersona();
    const messages = overrides.messages ?? [message("m1", "user", "Hello")];
    const chat = overrides.chat ?? createChat(messages, character.id);

    return {
        chat,
        character,
        groupCharacters: [],
        generation: {
            activeCharacterId: character.id,
            stream: false,
            trigger: "send",
        },
        messages,
        mode: "chat",
        persona,
        preset: createDefaultPreset("2026-01-01T00:00:00.000Z"),
        tokenBudget: 10000,
        userStatus: "online",
        ...overrides,
    };
}

function createCharacter(): SmileyCharacter {
    return {
        id: "char-1",
        version: 1,
        data: {
            ...defaultCharacterData,
            name: "Luna",
            description: "A character.",
            extensions: {},
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function createPersona(): SmileyPersona {
    return {
        id: "persona-1",
        version: 1,
        name: "Anon",
        description: "A tester.",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function createChat(messages: Message[], characterId: string): ChatSession {
    return {
        id: "chat-1",
        version: 1,
        characterId,
        defaultTitle: "Test chat",
        mode: "chat",
        messages,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function message(id: string, role: Message["role"], content: string): Message {
    return {
        id,
        author: role === "user" ? "Anon" : "Luna",
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${id}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
