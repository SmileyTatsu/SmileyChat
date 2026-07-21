import { describe, expect, test } from "bun:test";

import type { Message, SmileyCharacter } from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { createDefaultPreset, dynamicPromptIds } from "./defaults";
import { compilePresetMessages } from "./compile";
import type { PresetPrompt, SmileyPreset } from "./types";

describe("compilePresetMessages", () => {
    test("default preset includes empty world info slots", () => {
        const preset = createDefaultPreset("2026-01-01T00:00:00.000Z");

        expect(preset.prompts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: dynamicPromptIds.worldInfoBefore,
                    content: "",
                    title: "World Info Before",
                }),
                expect.objectContaining({
                    id: dynamicPromptIds.worldInfoAfter,
                    content: "",
                    title: "World Info After",
                }),
            ]),
        );
    });

    test("fills empty SillyTavern dynamic slot prompts with matching content", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.character, "Character Description", ""),
            prompt(dynamicPromptIds.characterPersonality, "Character Personality", ""),
            prompt(dynamicPromptIds.personaDescription, "Persona Description", ""),
            prompt(dynamicPromptIds.scenario, "Scenario", ""),
            prompt(dynamicPromptIds.chatExamples, "Chat Examples", ""),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [message("m1", "user", "Hello")];

        expect(
            textContents(compilePresetMessages(preset, context({ messages }))),
        ).toEqual([
            "A precise character description.",
            "Curious and direct.",
            "A careful tester.",
            "A quiet room.",
            "<START>\nLuna: Example line.",
            "Hello",
        ]);
    });

    test("does not append dynamic content when slot prompts contain text", () => {
        const preset = presetWithPrompts([
            prompt(
                dynamicPromptIds.character,
                "Character Description",
                "Custom character text.",
            ),
            prompt(
                dynamicPromptIds.characterPersonality,
                "Character Personality",
                "Custom personality text.",
            ),
            prompt(
                dynamicPromptIds.personaDescription,
                "Persona Description",
                "Custom persona text.",
            ),
            prompt(dynamicPromptIds.scenario, "Scenario", "Custom scenario text."),
            prompt(dynamicPromptIds.chatExamples, "Chat Examples", "Custom examples."),
        ]);

        expect(textContents(compilePresetMessages(preset, context()))).toEqual([
            "Custom character text.",
            "Custom personality text.",
            "Custom persona text.",
            "Custom scenario text.",
            "Custom examples.",
        ]);
    });

    test("emits file content parts for non-image attachments", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [
            {
                ...message("m1", "user", "Review this"),
                swipes: [
                    {
                        id: "m1-swipe",
                        content: "Review this",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        attachments: [
                            {
                                id: "notes.txt",
                                type: "file" as const,
                                url: "/api/chats/chat-1/attachments/notes.txt",
                                name: "notes.txt",
                                mimeType: "text/plain",
                                sizeBytes: 12,
                            },
                        ],
                    },
                ],
            },
        ];

        expect(compilePresetMessages(preset, context({ messages }))[0]?.content).toEqual([
            { type: "text", text: "Review this" },
            {
                type: "file",
                file: {
                    url: "/api/chats/chat-1/attachments/notes.txt",
                    filename: "notes.txt",
                    mime_type: "text/plain",
                    size_bytes: 12,
                },
            },
        ]);
    });

    test("expands active-swipe tool activities into tool protocol messages", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [
            {
                ...message("m1", "character", "It is sunny."),
                swipes: [
                    {
                        id: "m1-swipe",
                        content: "It is sunny.",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        toolActivities: [
                            {
                                call: {
                                    id: "call-1",
                                    name: "get_weather",
                                    argumentsText: '{"city":"Paris"}',
                                },
                                result: {
                                    toolCallId: "call-1",
                                    name: "get_weather",
                                    content: "Sunny, 20°C",
                                },
                            },
                        ],
                    },
                ],
            },
        ];

        const compiled = compilePresetMessages(preset, context({ messages }));

        expect(compiled).toEqual([
            expect.objectContaining({
                role: "assistant",
                content: "",
                toolCalls: [expect.objectContaining({ id: "call-1" })],
            }),
            expect.objectContaining({
                role: "user",
                content: "Sunny, 20°C",
                toolResult: expect.objectContaining({ toolCallId: "call-1" }),
            }),
            expect.objectContaining({
                role: "assistant",
                content: "It is sunny.",
            }),
        ]);
    });

    test("keeps a paused tool-call turn after completed tool activities", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [
            {
                ...message("m1", "character", "Checking the final record."),
                swipes: [
                    {
                        id: "m1-swipe",
                        content: "Checking the final record.",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        toolActivities: [
                            {
                                call: {
                                    id: "call-1",
                                    name: "lookup",
                                    argumentsText: "{}",
                                },
                                result: {
                                    toolCallId: "call-1",
                                    name: "lookup",
                                    content: "First result",
                                },
                            },
                        ],
                        pendingToolContinuation: {
                            profileId: "profile-1",
                            toolCalls: [
                                { id: "call-2", name: "verify", argumentsText: "{}" },
                            ],
                        },
                    },
                ],
            },
        ];

        expect(compilePresetMessages(preset, context({ messages }))).toEqual([
            expect.objectContaining({
                toolCalls: [expect.objectContaining({ id: "call-1" })],
            }),
            expect.objectContaining({
                toolResult: expect.objectContaining({ toolCallId: "call-1" }),
            }),
            expect.objectContaining({
                role: "assistant",
                content: "Checking the final record.",
                toolCalls: [expect.objectContaining({ id: "call-2" })],
            }),
        ]);
    });

    test("orders overflow injections by requested depth without crossing before and after", () => {
        const preset = presetWithPrompts([
            injectedPrompt("before-latest", "before", 0),
            injectedPrompt("after-latest", "after", 0),
            injectedPrompt("after-deep-first", "after", 4),
            injectedPrompt("after-deep-second", "after", 4),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);

        expect(
            textContents(
                compilePresetMessages(
                    preset,
                    context({ messages: [message("m1", "user", "Hello")] }),
                ),
            ),
        ).toEqual([
            "before-latest",
            "Hello",
            "after-deep-first",
            "after-deep-second",
            "after-latest",
        ]);
    });

    test("preserves prompt order for equal-depth injected prompts", () => {
        const preset = presetWithPrompts([
            injectedPrompt("after-first", "after", 1),
            injectedPrompt("after-second", "after", 1),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);

        expect(
            textContents(
                compilePresetMessages(
                    preset,
                    context({
                        messages: [
                            message("m1", "user", "First"),
                            message("m2", "character", "Second"),
                        ],
                    }),
                ),
            ),
        ).toEqual(["First", "after-first", "after-second", "Second"]);
    });

    test("places in-range injections around their target message", () => {
        const preset = presetWithPrompts([
            injectedPrompt("before", "before", 1),
            injectedPrompt("after", "after", 1),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);

        expect(
            textContents(
                compilePresetMessages(
                    preset,
                    context({
                        messages: [
                            message("m1", "user", "First"),
                            message("m2", "character", "Second"),
                        ],
                    }),
                ),
            ),
        ).toEqual(["before", "First", "after", "Second"]);
    });

    test("keeps injected prompt order when history is empty", () => {
        const preset = presetWithPrompts([
            injectedPrompt("first", "after", 4),
            injectedPrompt("second", "before", 0),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);

        expect(textContents(compilePresetMessages(preset, context()))).toEqual([
            "first",
            "second",
        ]);
    });

    test("keeps expanded tool protocol messages together as one depth unit", () => {
        const preset = presetWithPrompts([
            injectedPrompt("after-tool-turn", "after", 0),
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const toolTurn = {
            ...message("m1", "character", "The lookup is complete."),
            swipes: [
                {
                    id: "m1-swipe",
                    content: "The lookup is complete.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    toolActivities: [
                        {
                            call: {
                                id: "call-1",
                                name: "lookup",
                                argumentsText: "{}",
                            },
                            result: {
                                toolCallId: "call-1",
                                name: "lookup",
                                content: "Found it",
                            },
                        },
                    ],
                },
            ],
        };

        expect(
            textContents(
                compilePresetMessages(preset, context({ messages: [toolTurn] })),
            ),
        ).toEqual(["Found it", "The lookup is complete.", "after-tool-turn"]);
    });
});

function context(overrides: { messages?: Message[] } = {}) {
    return {
        character: createCharacter(),
        messages: overrides.messages ?? [],
        mode: "chat" as const,
        personaDescription: "A careful tester.",
        personaName: "Anon",
        userStatus: "online" as const,
    };
}

function createCharacter(): SmileyCharacter {
    return {
        id: "char-1",
        version: 1,
        data: {
            ...defaultCharacterData,
            name: "Luna",
            description: "A precise character description.",
            personality: "Curious and direct.",
            scenario: "A quiet room.",
            mes_example: "<START>\n{{char}}: Example line.",
            extensions: {},
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function presetWithPrompts(prompts: PresetPrompt[]): SmileyPreset {
    return {
        id: "test-preset",
        title: "Test",
        prompts,
        promptOrder: prompts.map((item) => ({
            promptId: item.id,
            enabled: true,
        })),
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function prompt(id: string, title: string, content: string): PresetPrompt {
    return {
        id,
        title,
        role: "system",
        content,
        systemPrompt: false,
        marker: true,
        injectionPosition: "none",
        injectionDepth: 0,
        forbidOverrides: false,
    };
}

function injectedPrompt(
    content: string,
    injectionPosition: PresetPrompt["injectionPosition"],
    injectionDepth: number,
): PresetPrompt {
    return {
        ...prompt(content, content, content),
        injectionPosition,
        injectionDepth,
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

function textContents(messages: ReturnType<typeof compilePresetMessages>) {
    return messages.map((item) => item.content).filter((content) => content !== "");
}
