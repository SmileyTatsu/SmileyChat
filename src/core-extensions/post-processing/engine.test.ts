import { describe, expect, test } from "bun:test";

import { buildBudgetedPassMessages, buildPassMessages } from "./engine";
import type { PipelinePass } from "./settings";

const pass: PipelinePass = {
    id: "pass-a",
    name: "Pass A",
    enabled: true,
    prompt: "Rewrite for {{char}} and {{user}}.",
    profileId: "",
    presetId: "",
    modelId: "",
    contextMessageLimit: 100,
    includeCharacter: true,
    includeSceneContext: true,
    stream: true,
};

describe("post-processing engine", () => {
    test("isolates text to transform and resolves macros", () => {
        const messages = buildPassMessages(api(), pass, "Original reply.", {
            character: character(),
            messages: [
                {
                    id: "message-a",
                    activeSwipeIndex: 0,
                    author: "Anon",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    role: "user",
                    swipes: [
                        {
                            id: "swipe-a",
                            content: "Hello.",
                            createdAt: "2026-01-01T00:00:00.000Z",
                        },
                    ],
                },
            ],
            mode: "rp",
            personaDescription: "A test persona.",
            personaName: "Anon",
            presetCollection: emptyPresetCollection(),
            userStatus: "online",
        });

        expect(messages[0]).toMatchObject({
            role: "system",
            content: "Rewrite for Luna and Anon.",
        });
        expect(messages[1].content).toContain("<character>");
        expect(messages[1].content).toContain("<scene_context>");
        expect(messages[1].content).toContain(
            "<text_to_transform>\nOriginal reply.\n</text_to_transform>",
        );
    });

    test("respects context toggles", () => {
        const messages = buildPassMessages(
            api(),
            {
                ...pass,
                includeCharacter: false,
                includeSceneContext: false,
            },
            "Only this.",
            {
                character: character(),
                messages: [],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: emptyPresetCollection(),
                userStatus: "away",
            },
        );

        expect(messages[1].content).not.toContain("<character>");
        expect(messages[1].content).not.toContain("<scene_context>");
        expect(messages[1].content).toBe(
            "<text_to_transform>\nOnly this.\n</text_to_transform>",
        );
    });

    test("limits direct scene context to the latest configured messages", () => {
        const messages = buildPassMessages(
            api(),
            {
                ...pass,
                includeCharacter: false,
                contextMessageLimit: 1,
            },
            "Only this.",
            {
                character: character(),
                messages: [
                    message("old-message", "Old context."),
                    message("new-message", "New context."),
                ],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: emptyPresetCollection(),
                userStatus: "away",
            },
        );

        expect(messages[1].content).not.toContain("Old context.");
        expect(messages[1].content).toContain("New context.");
    });

    test("omits the system message when the pass prompt is empty", () => {
        const messages = buildPassMessages(
            api(),
            {
                ...pass,
                prompt: "",
                includeCharacter: false,
                includeSceneContext: false,
            },
            "Only this.",
            {
                character: character(),
                messages: [],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: emptyPresetCollection(),
                userStatus: "away",
            },
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            role: "user",
            content: "<text_to_transform>\nOnly this.\n</text_to_transform>",
        });
    });

    test("uses the selected preset for prompt construction", () => {
        const messages = buildPassMessages(
            api(),
            {
                ...pass,
                presetId: "preset-a",
                includeCharacter: false,
                includeSceneContext: false,
            },
            "Only this.",
            {
                character: character(),
                messages: [],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: presetCollection(),
                userStatus: "away",
            },
        );

        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({
            role: "system",
            content: "Preset system for Luna.",
        });
        expect(messages[1].content).toContain(
            "<post_processing_instruction>\nRewrite for Luna and Anon.\n</post_processing_instruction>",
        );
        expect(messages[1].content).toContain(
            "<text_to_transform>\nOnly this.\n</text_to_transform>",
        );
        expect(messages[1].content).not.toContain("<character>");
    });

    test("limits preset history to the latest configured messages", () => {
        const messages = buildPassMessages(
            api(),
            {
                ...pass,
                presetId: "preset-a",
                contextMessageLimit: 1,
            },
            "Only this.",
            {
                character: character(),
                messages: [
                    message("old-message", "Old context."),
                    message("new-message", "New context."),
                ],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: presetCollection(),
                userStatus: "away",
            },
        );

        const compiledContent = messages.map((item) => String(item.content)).join("\n");

        expect(compiledContent).not.toContain("Old context.");
        expect(compiledContent).toContain("New context.");
        expect(compiledContent).toContain(
            "<text_to_transform>\nOnly this.\n</text_to_transform>",
        );
    });

    test("trims oldest scene context to fit the token budget", () => {
        const messages = buildBudgetedPassMessages(
            budgetApi(),
            {
                ...pass,
                includeCharacter: false,
                contextMessageLimit: -1,
            },
            "Only this.",
            {
                character: character(),
                messages: [
                    message("old-message", "Old context."),
                    message("middle-message", "Middle context."),
                    message("new-message", "New context."),
                ],
                mode: "chat",
                personaDescription: "",
                personaName: "Anon",
                presetCollection: emptyPresetCollection(),
                userStatus: "away",
            },
            2,
        );

        const content = messages.map((item) => String(item.content)).join("\n");

        expect(content).not.toContain("Old context.");
        expect(content).not.toContain("Middle context.");
        expect(content).toContain("New context.");
    });
});

function api() {
    return {
        presets: {
            resolveMacros(text: string) {
                return text.replace("{{char}}", "Luna").replace("{{user}}", "Anon");
            },
        },
    } as never;
}

function budgetApi() {
    return {
        presets: {
            resolveMacros(text: string) {
                return text.replace("{{char}}", "Luna").replace("{{user}}", "Anon");
            },
        },
        model: {
            estimateTokens(messages: Array<{ content: string }>) {
                const content = messages.map((item) => String(item.content)).join("\n");
                const contextCount = [
                    "Old context.",
                    "Middle context.",
                    "New context.",
                ].filter((text) => content.includes(text)).length;

                return contextCount > 1 ? 3 : 2;
            },
        },
    } as never;
}

function character() {
    return {
        id: "character-a",
        data: {
            name: "Luna",
            description: "A moonlit guide.",
            personality: "Calm.",
            scenario: "A quiet room.",
            system_prompt: "",
            post_history_instructions: "",
        },
    } as never;
}

function message(id: string, content: string) {
    return {
        id,
        activeSwipeIndex: 0,
        author: "Anon",
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "user",
        swipes: [
            {
                id: `${id}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    } as never;
}

function emptyPresetCollection() {
    return {
        activePresetId: "",
        presets: [],
    };
}

function presetCollection() {
    const now = "2026-01-01T00:00:00.000Z";

    return {
        activePresetId: "preset-a",
        presets: [
            {
                id: "preset-a",
                title: "Post preset",
                createdAt: now,
                updatedAt: now,
                prompts: [
                    {
                        id: "system",
                        title: "System",
                        role: "system",
                        content: "Preset system for {{char}}.",
                        systemPrompt: true,
                        marker: false,
                        injectionPosition: "none",
                        injectionDepth: 0,
                        forbidOverrides: false,
                    },
                    {
                        id: "history",
                        title: "History",
                        role: "user",
                        content: "{{chat_history}}",
                        systemPrompt: false,
                        marker: false,
                        injectionPosition: "none",
                        injectionDepth: 0,
                        forbidOverrides: false,
                    },
                ],
                promptOrder: [
                    { promptId: "system", enabled: true },
                    { promptId: "history", enabled: true },
                ],
            },
        ],
    } as never;
}
