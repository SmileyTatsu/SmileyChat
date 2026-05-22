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
