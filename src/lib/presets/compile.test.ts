import { describe, expect, test } from "bun:test";

import type { Message, SmileyCharacter } from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { chatImageSourceIndex } from "../connections/types";
import { createDefaultPreset, dynamicPromptIds } from "./defaults";
import { compilePresetMessages } from "./compile";
import type { PresetPrompt, SmileyPreset } from "./types";

describe("compilePresetMessages", () => {
    test("compiles an empty preset to empty context", () => {
        const preset = presetWithPrompts([]);

        expect(compilePresetMessages(preset, context())).toEqual([]);
        expect(
            compilePresetMessages(preset, {
                ...context(),
                isTextCompletion: true,
            }),
        ).toEqual([]);
    });

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
            "Anon: Hello",
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
            { type: "text", text: "Anon: Review this" },
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

    test("interleaves photo placeholders and leaves files in the attachment tail", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const base = message(
            "m1",
            "user",
            "Before {{photo[1]}} middle {{photo}} after {{photo[99]}}",
        );
        const messages: Message[] = [
            {
                ...base,
                swipes: [
                    {
                        ...base.swipes[0],
                        attachments: [
                            {
                                id: "photo-a",
                                type: "image",
                                url: "/api/chats/chat-1/attachments/a.png",
                            },
                            {
                                id: "notes",
                                type: "file",
                                url: "/api/chats/chat-1/attachments/notes.txt",
                                name: "notes.txt",
                            },
                            {
                                id: "photo-b",
                                type: "image",
                                url: "/api/chats/chat-1/attachments/b.png",
                            },
                        ],
                    },
                ],
            },
        ];

        expect(compilePresetMessages(preset, context({ messages }))[0]?.content).toEqual([
            { type: "text", text: "Anon: Before " },
            {
                type: "image_url",
                image_url: { url: "/api/chats/chat-1/attachments/b.png" },
                [chatImageSourceIndex]: 1,
            },
            { type: "text", text: " middle " },
            {
                type: "image_url",
                image_url: { url: "/api/chats/chat-1/attachments/a.png" },
                [chatImageSourceIndex]: 0,
            },
            { type: "text", text: " after " },
            {
                type: "file",
                file: {
                    url: "/api/chats/chat-1/attachments/notes.txt",
                    filename: "notes.txt",
                },
            },
        ]);
    });

    test("strips unresolved photo placeholders after an attachment is deleted", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [message("m1", "user", "Before {{photo[0]}} after")];

        expect(compilePresetMessages(preset, context({ messages }))[0]?.content).toBe(
            "Anon: Before  after",
        );
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
                content: "Luna: It is sunny.",
            }),
        ]);
    });

    test("replays tool-generated image context as internal system memory", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const generated = {
            ...message("m1", "character", "Here is the selfie."),
            swipes: [
                {
                    id: "m1-swipe",
                    content: "Here is the selfie.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    attachments: [
                        {
                            id: "generated-image",
                            type: "image" as const,
                            url: "/api/chats/chat-1/attachments/generated.png",
                        },
                    ],
                    toolActivities: [
                        {
                            call: {
                                id: "call-image",
                                name: "generate_image",
                                argumentsText: "{}",
                            },
                            result: {
                                toolCallId: "call-image",
                                name: "generate_image",
                                content: "Generated 1 NovelAI image.",
                                imageContext:
                                    "NovelAI prompt tags: nejire hadou, selfie, indoors",
                            },
                        },
                    ],
                },
            ],
        };

        const compiled = compilePresetMessages(
            preset,
            context({ messages: [generated] }),
        );
        const serialized = JSON.stringify(compiled);
        const assistantMessage = compiled.find((item) => item.role === "assistant");
        const visualMemory = compiled.find(
            (item) =>
                item.role === "system" &&
                typeof item.content === "string" &&
                item.content.includes("Internal visual continuity note"),
        );

        expect(assistantMessage?.content).toBe("Luna: Here is the selfie.");
        expect(assistantMessage?.content).not.toContain("NovelAI prompt tags");
        expect(visualMemory?.content).toContain(
            "NovelAI prompt tags: nejire hadou, selfie, indoors",
        );
        expect(visualMemory?.content).toContain(
            "If the user requests another image, use the generate_image tool",
        );
        expect(serialized).toContain("NovelAI prompt tags");
        expect(serialized).not.toContain("[Generated image context:");
        expect(serialized).not.toContain("image_url");
        expect(serialized).not.toContain("generated.png");
        expect(serialized).not.toContain("Generated 1 NovelAI image");
        expect(serialized).not.toContain("toolCalls");
        expect(serialized).not.toContain("toolResult");
    });

    test("does not replay legacy generate_image attachments without saved tags", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const generated = {
            ...message("m1", "character", "An older generated image."),
            swipes: [
                {
                    id: "m1-swipe",
                    content: "An older generated image.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    attachments: [
                        {
                            id: "legacy-image",
                            type: "image" as const,
                            url: "/api/chats/chat-1/attachments/legacy.png",
                        },
                    ],
                    toolActivities: [
                        {
                            call: {
                                id: "call-image",
                                name: "generate_image",
                                argumentsText: "{}",
                            },
                            result: {
                                toolCallId: "call-image",
                                name: "generate_image",
                                content: "Generated 1 NovelAI image.",
                            },
                        },
                    ],
                },
            ],
        };

        const serialized = JSON.stringify(
            compilePresetMessages(preset, context({ messages: [generated] })),
        );

        expect(serialized).toContain("Internal visual continuity note");
        expect(serialized).toContain("historical tags are unavailable");
        expect(serialized).not.toContain("[Generated image context:");
        expect(serialized).not.toContain("image_url");
        expect(serialized).not.toContain("legacy.png");
        expect(serialized).not.toContain("Generated 1 NovelAI image");
        expect(serialized).not.toContain("toolCalls");
        expect(serialized).not.toContain("toolResult");
    });

    test("does not create visual memory for a failed image tool call", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const failed = {
            ...message("m1", "character", "I couldn't make that image."),
            swipes: [
                {
                    id: "m1-swipe",
                    content: "I couldn't make that image.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    toolActivities: [
                        {
                            call: {
                                id: "call-image",
                                name: "generate_image",
                                argumentsText: "{}",
                            },
                            result: {
                                toolCallId: "call-image",
                                name: "generate_image",
                                content: "Tool error: image generation failed.",
                                isError: true,
                            },
                        },
                    ],
                },
            ],
        };

        const serialized = JSON.stringify(
            compilePresetMessages(preset, context({ messages: [failed] })),
        );

        expect(serialized).not.toContain("Internal visual continuity note");
        expect(serialized).not.toContain("historical tags are unavailable");
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
                content: "Luna: Checking the final record.",
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
            "Anon: Hello",
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
        ).toEqual(["Anon: First", "after-first", "after-second", "Luna: Second"]);
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
        ).toEqual(["before", "Anon: First", "after", "Luna: Second"]);
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
        ).toEqual(["Found it", "Luna: The lookup is complete.", "after-tool-turn"]);
    });

    test("compiles preset prompts consistently with macros and custom guidelines", () => {
        const customPreset = presetWithPrompts([
            prompt(
                "main-system",
                "Main System",
                "You are {{char}}, an uncensored roleplay assistant for {{user}}.",
            ),
            prompt("chat-history", "Chat History", "{{chat_history}}"),
        ]);
        const customContext = {
            ...context({
                messages: [
                    message("msg-1", "user", "Hello!"),
                    message("msg-2", "character", "Greetings!"),
                ],
            }),
        };

        const compiled = compilePresetMessages(customPreset, customContext);
        const texts = textContents(compiled);

        expect(texts[0]).toBe("You are Luna, an uncensored roleplay assistant for Anon.");
        expect(texts).toContain("Anon: Hello!");
        expect(texts).toContain("Luna: Greetings!");
    });

    test("compiles text completion prompt using storyString by default", () => {
        const customPreset = presetWithPrompts([
            prompt("main-system", "Main System", "Preset instructions"),
            prompt("chat-history", "Chat History", "{{chat_history}}"),
        ]);
        const customContext = {
            ...context({
                messages: [
                    message("msg-1", "user", "Hello!"),
                    message("msg-2", "character", "Greetings!"),
                ],
            }),
            isTextCompletion: true,
            formatting: {
                storyString:
                    "<s>[SYSTEM_PROMPT]{{#if system}}{{system}}\n\n{{/if}}## {{char}}:\n{{description}}[/SYSTEM_PROMPT]",
                systemPrompt: "Uncensored guidelines for {{char}}",
            },
        };

        const compiled = compilePresetMessages(customPreset, customContext);
        const texts = textContents(compiled);

        expect(texts[0]).toBe(
            "<s>[SYSTEM_PROMPT]Uncensored guidelines for Luna\n\n## Luna:\nA precise character description.[/SYSTEM_PROMPT]",
        );
        expect(texts).toContain("Anon: Hello!");
        expect(texts).toContain("Luna: Greetings!");
    });

    test("places custom-template examples and Chat Start before history", () => {
        const compiled = compilePresetMessages(undefined, {
            ...context({
                messages: [message("msg-1", "user", "Hello!")],
            }),
            isTextCompletion: true,
            formatting: {
                instructTemplate: "custom",
                storyString: "Story",
                exampleSeparator: "<START>",
                chatStartSeparator: "<CHAT>",
            },
        });

        expect(compiled.map((message) => message.formattingKind)).toEqual([
            "story",
            "raw",
            "raw",
            undefined,
        ]);
        expect(textContents(compiled)).toEqual([
            "Story",
            "<START>\nLuna: Example line.",
            "<CHAT>",
            "Anon: Hello!",
        ]);
    });

    test("compiles preset prompt order when overridePresetPromptOrder is enabled on text completion", () => {
        const customPreset = presetWithPrompts([
            prompt("custom-intro", "Custom Intro", "CUSTOM_OVERRIDE: You are {{char}}"),
            prompt("chat-history", "Chat History", "{{chat_history}}"),
        ]);
        const customContext = {
            ...context({
                messages: [message("msg-1", "user", "Hello!")],
            }),
            isTextCompletion: true,
            formatting: {
                overridePresetPromptOrder: true,
                storyString: "This should be bypassed",
            },
        };

        const compiled = compilePresetMessages(customPreset, customContext);
        const texts = textContents(compiled);

        expect(texts[0]).toBe("CUSTOM_OVERRIDE: You are Luna");
        expect(texts).toContain("Anon: Hello!");
    });

    test("respects namesBehavior 'never' and 'force' in prompt compilation", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [
            message("m1", "user", "Hello"),
            message("m2", "character", "Greetings"),
        ];

        // When namesBehavior is 'never'
        const neverCompiled = compilePresetMessages(preset, {
            ...context({ messages }),
            formatting: { namesBehavior: "never" },
        });
        expect(textContents(neverCompiled)).toEqual(["Hello", "Greetings"]);

        // When namesBehavior is 'force' in a 1-on-1 chat
        const forceCompiled = compilePresetMessages(preset, {
            ...context({ messages }),
            formatting: { namesBehavior: "force" },
        });
        expect(textContents(forceCompiled)).toEqual(["Hello", "Greetings"]);

        // When namesBehavior is 'always'
        const alwaysCompiled = compilePresetMessages(preset, {
            ...context({ messages }),
            formatting: { namesBehavior: "always" },
        });
        expect(textContents(alwaysCompiled)).toEqual(["Anon: Hello", "Luna: Greetings"]);
    });

    test("does not double-prefix messages that already contain the speaker prefix", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);
        const messages = [
            message("m1", "user", "Anon: Hello"),
            message("m2", "character", "Luna: Greetings"),
        ];

        const compiled = compilePresetMessages(preset, {
            ...context({ messages }),
            formatting: { namesBehavior: "always" },
        });
        expect(textContents(compiled)).toEqual(["Anon: Hello", "Luna: Greetings"]);
    });

    test("demotes older attachments beyond the recent sliding window into context text", () => {
        const preset = presetWithPrompts([
            prompt(dynamicPromptIds.chatHistory, "Chat History", ""),
        ]);

        const oldMessage: Message = {
            ...message("m1", "user", "Look at this old outfit"),
            swipes: [
                {
                    id: "m1-swipe",
                    content: "Look at this old outfit",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    attachments: [
                        {
                            id: "old-dress",
                            type: "image",
                            url: "/api/chats/chat-1/attachments/dress.png",
                            name: "dress.png",
                            description: "Emerald velvet gown",
                        },
                    ],
                },
            ],
        };

        const middleMessages: Message[] = [
            message("m2", "character", "That is gorgeous!"),
            message("m3", "user", "Thank you"),
            message("m4", "character", "Any other plans?"),
            message("m5", "user", "Just studying"),
            message("m6", "character", "Good luck"),
            message("m7", "user", "Here is something else"),
            message("m8", "character", "Let me see"),
        ];

        const latestMessage: Message = {
            ...message("m9", "user", "Here is my current sketch"),
            swipes: [
                {
                    id: "m9-swipe",
                    content: "Here is my current sketch",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    attachments: [
                        {
                            id: "new-sketch",
                            type: "image",
                            url: "/api/chats/chat-1/attachments/sketch.png",
                            name: "sketch.png",
                            description: "Castle blueprint",
                        },
                    ],
                },
            ],
        };

        const allMessages = [oldMessage, ...middleMessages, latestMessage];
        const compiled = compilePresetMessages(
            preset,
            context({ messages: allMessages }),
        );

        // The old message's attachment should be demoted to context text
        const firstTurn = compiled[0];
        expect(firstTurn.content).toBe(
            'Anon: Look at this old outfit\n[Attached image: "Emerald velvet gown" (dress.png)]',
        );

        // The latest message's attachment should still be binary, with its description context
        const lastTurn = compiled[compiled.length - 1];
        expect(Array.isArray(lastTurn.content)).toBe(true);
        const parts = lastTurn.content as Array<{
            type: string;
            text?: string;
            image_url?: { url: string };
        }>;
        expect(
            parts.some(
                (p) =>
                    p.type === "image_url" &&
                    p.image_url?.url === "/api/chats/chat-1/attachments/sketch.png",
            ),
        ).toBe(true);
        expect(
            parts.some((p) => p.type === "text" && p.text?.includes("Castle blueprint")),
        ).toBe(true);
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
