import { describe, expect, test } from "bun:test";

import type {
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
} from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { defaultAppPreferences } from "../preferences/types";
import { createDefaultPreset } from "../presets/defaults";
import type { SmileyPreset } from "../presets/types";
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
            tokenBudget: 800,
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
        expect(depthIndex).toBeGreaterThan(lastUserIndex);
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

    test("trims assembled history before removing counted injections", async () => {
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages: [
                    message("m1", "user", "old ".repeat(100)),
                    message("m2", "character", "middle ".repeat(100)),
                    message("m3", "user", "latest"),
                ],
                preset: createTinyPreset(),
                tokenBudget: 240,
            }),
            injectors: [
                () => [
                    {
                        id: "counted-lore",
                        anchor: "before-history",
                        content: "counted lore",
                        order: 0,
                        role: "system",
                        source: "lorebook",
                    },
                ],
            ],
        });

        expect(result.debug.trimmedMessageIds).toEqual(["m1", "m2"]);
        expect(result.messages.map((item) => item.id)).toEqual(["m3"]);
        expect(
            result.promptMessages.some((item) => item.content === "counted lore"),
        ).toBe(true);
    });

    test("removes counted injections after history is exhausted", async () => {
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages: [message("m1", "user", "latest")],
                preset: createTinyPreset(),
                tokenBudget: 80,
            }),
            injectors: [
                () => [
                    {
                        id: "counted-lore",
                        anchor: "before-history",
                        content: "counted lore ".repeat(15),
                        order: 0,
                        role: "system",
                        source: "lorebook",
                    },
                ],
            ],
        });

        expect(result.messages.map((item) => item.id)).toEqual(["m1"]);
        expect(
            result.promptMessages.some(
                (item) =>
                    typeof item.content === "string" &&
                    item.content.includes("counted lore"),
            ),
        ).toBe(false);
    });

    test("throws instead of dropping the latest user turn", async () => {
        await expect(
            buildPromptForGeneration({
                context: createPromptContext({
                    messages: [message("m1", "user", "latest ".repeat(300))],
                    preset: createTinyPreset(),
                    tokenBudget: 80,
                }),
            }),
        ).rejects.toThrow("exceeds the active context token limit");
    });

    test("pre-trims long history before compiling selected turns only", async () => {
        const messages = Array.from({ length: 200 }, (_, index) =>
            message(
                `m${index + 1}`,
                index % 2 === 0 ? "user" : "character",
                `turn ${index + 1} ${"word ".repeat(20)}`,
            ),
        );
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages,
                preset: createTinyPreset(),
                tokenBudget: 900,
            }),
        });

        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.messages.length).toBeLessThan(messages.length);
        expect(result.messages[result.messages.length - 1]?.id).toBe("m200");
        expect(result.debug.trimmedMessageIds).toContain("m1");
        expect(result.debug.trimmedMessageIds.length).toBe(
            messages.length - result.messages.length,
        );
        expect(result.debug.selectedMessageIds).toEqual(
            result.messages.map((item) => item.id),
        );
    });

    test("keeps the latest user turn when older history is discarded", async () => {
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages: [
                    message("m1", "user", "old ".repeat(120)),
                    message("m2", "character", "mid ".repeat(120)),
                    message("m3", "user", "latest"),
                ],
                preset: createTinyPreset(),
                tokenBudget: 240,
            }),
        });

        expect(result.messages.map((item) => item.id)).toEqual(["m3"]);
        expect(result.debug.trimmedMessageIds).toEqual(["m1", "m2"]);
    });

    test("resolves {{message_count}} against the full session while inserting only budgeted history", async () => {
        const messages = Array.from({ length: 1000 }, (_, index) =>
            message(
                `m${index + 1}`,
                index % 2 === 0 ? "user" : "character",
                `turn ${index + 1} ${"word ".repeat(12)}`,
            ),
        );
        const result = await buildPromptForGeneration({
            context: createPromptContext({
                messages,
                preset: createMessageCountPreset(),
                tokenBudget: 1200,
            }),
        });

        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.messages.length).toBeLessThan(100);
        expect(
            result.promptMessages.some(
                (item) =>
                    typeof item.content === "string" && item.content.includes("1000"),
            ),
        ).toBe(true);
        expect(result.messages[result.messages.length - 1]?.id).toBe("m1000");
    });

    test("final budget trim keeps the latest user turn when history macros expand", async () => {
        const longDescription = "desc ".repeat(400);
        const character = createCharacter();
        character.data.description = longDescription;

        const result = await buildPromptForGeneration({
            context: createPromptContext({
                character,
                messages: [
                    message("m1", "character", "{{char_description}}"),
                    message("m2", "user", "old ".repeat(40)),
                    message("m3", "character", "{{char_description}}"),
                    message("m4", "user", "latest"),
                ],
                preset: createTinyPreset(),
                tokenBudget: 500,
            }),
        });

        expect(result.messages.map((item) => item.id)).toContain("m4");
        expect(result.messages[result.messages.length - 1]?.id).toBe("m4");
        expect(result.debug.tokenEstimate).toBeLessThanOrEqual(500);
        expect(
            result.promptMessages.some(
                (item) =>
                    typeof item.content === "string" && item.content.includes("latest"),
            ),
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
        lorebooks: [],
        messages,
        mode: "chat",
        persona,
        preferences: defaultAppPreferences,
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

function createTinyPreset(): SmileyPreset {
    const createdAt = "2026-01-01T00:00:00.000Z";

    return {
        id: "tiny-preset",
        title: "Tiny",
        prompts: [
            {
                id: "system",
                title: "System",
                role: "system",
                content: "System.",
                systemPrompt: true,
                marker: true,
                injectionPosition: "none",
                injectionDepth: 0,
                forbidOverrides: false,
                anchor: "before-history",
            },
            {
                id: "history",
                title: "History",
                role: "system",
                content: "{{chat_history}}",
                systemPrompt: false,
                marker: true,
                injectionPosition: "none",
                injectionDepth: 0,
                forbidOverrides: false,
                anchor: "before-history",
            },
        ],
        promptOrder: [
            { promptId: "system", enabled: true },
            { promptId: "history", enabled: true },
        ],
        createdAt,
        updatedAt: createdAt,
    };
}

function createMessageCountPreset(): SmileyPreset {
    const preset = createTinyPreset();

    return {
        ...preset,
        id: "message-count-preset",
        title: "Message count",
        prompts: preset.prompts.map((prompt) =>
            prompt.id === "system"
                ? {
                      ...prompt,
                      content: "Message count: {{message_count}}",
                  }
                : prompt,
        ),
    };
}
