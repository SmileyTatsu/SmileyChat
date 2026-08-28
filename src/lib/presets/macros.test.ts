import { describe, expect, test } from "bun:test";

import type { Message, SmileyCharacter } from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { renderStoryString, resolvePresetMacros, type MacroContext } from "./macros";

describe("resolvePresetMacros", () => {
    test("returns plain text without scanning when no macros are present", () => {
        const content = "Hello there, plain history turn with no braces.";

        expect(resolvePresetMacros(content, createMacroContext())).toBe(content);
    });

    test("returns empty content unchanged", () => {
        expect(resolvePresetMacros("", createMacroContext())).toBe("");
    });

    test("still resolves macros when present", () => {
        expect(resolvePresetMacros("Hi {{char}}", createMacroContext())).toBe("Hi Luna");
    });

    test("still resolves message count against session messages", () => {
        const context = createMacroContext({
            messages: [
                message("m1", "user", "one"),
                message("m2", "character", "two"),
                message("m3", "user", "three"),
            ],
        });

        expect(resolvePresetMacros("count={{message_count}}", context)).toBe("count=3");
    });

    test("evaluates {{#if}} conditionals and resolves SillyTavern macro aliases", () => {
        const context = createMacroContext({
            character: {
                id: "char-1",
                version: 1,
                data: {
                    ...defaultCharacterData,
                    name: "Luna",
                    description: "Fierce warrior.",
                    personality: "",
                    scenario: "In a forest.",
                    mes_example: "{{char}}: Hello.",
                    system_prompt: "You are Luna.",
                    extensions: {},
                },
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        });

        const template = [
            "{{#if description}}## {{char}}'s Description:\n{{description}}\n{{/if}}",
            "{{#if personality}}## Personality:\n{{personality}}\n{{/if}}",
            "{{#if scenario}}## Scenario:\n{{scenario}}\n{{/if}}",
            "{{#if persona}}## {{user}}'s Persona:\n{{persona}}\n{{/if}}",
            "{{#if mesExamples}}## Examples:\n{{mesExamples}}\n{{/if}}",
        ].join("\n");

        const resolved = resolvePresetMacros(template, context);

        expect(resolved).toContain("## Luna's Description:\nFierce warrior.");
        expect(resolved).not.toContain("## Personality:");
        expect(resolved).toContain("## Scenario:\nIn a forest.");
        expect(resolved).toContain("## Anon's Persona:\nA tester.");
        expect(resolved).toContain("## Examples:\nLuna: Hello.");
    });

    test("evaluates {{#if ... else}} and {{#unless}} conditional branches", () => {
        const context = createMacroContext();
        expect(
            resolvePresetMacros(
                "{{#if personality}}Has personality{{else}}No personality{{/if}}",
                context,
            ),
        ).toBe("No personality");
        expect(
            resolvePresetMacros(
                "{{#unless personality}}Personality missing{{/unless}}",
                context,
            ),
        ).toBe("Personality missing");
    });

    test("renders Story Strings with Handlebars blocks and separate lore positions", () => {
        const rendered = renderStoryString(
            "{{#if wiBefore}}Before: {{wiBefore}}{{/if}}|{{#if wiAfter}}After: {{wiAfter}}{{/if}}|{{#each tags}}{{this}},{{/each}}",
            {
                ...createMacroContext(),
                worldInfoBefore: "Old map",
                worldInfoAfter: "New clue",
            },
        );

        expect(rendered).toBe("Before: Old map|After: New clue|");
    });

    test("renders structured prompt anchors in Story Strings", () => {
        expect(
            renderStoryString("{{anchorBefore}}|{{anchorAfter}}", {
                ...createMacroContext(),
                anchorBefore: "Before character",
                anchorAfter: "After character",
            }),
        ).toBe("Before character|After character");
    });

    test("supports SillyTavern anchorTop and anchorBottom aliases", () => {
        expect(
            renderStoryString("{{anchorTop}}|{{anchorBottom}}", {
                ...createMacroContext(),
                anchorBefore: "Top",
                anchorAfter: "Bottom",
            }),
        ).toBe("Top|Bottom");
    });

    test("resolves {{chat_history}} respecting namesBehavior setting", () => {
        const messages = [
            message("m1", "user", "Hello there"),
            message("m2", "character", "Greetings"),
        ];

        // Default / 'always'
        const alwaysCtx = createMacroContext({
            messages,
            formatting: { namesBehavior: "always" },
        });
        expect(resolvePresetMacros("{{chat_history}}", alwaysCtx)).toBe(
            "Anon: Hello there\nLuna: Greetings",
        );

        // 'never'
        const neverCtx = createMacroContext({
            messages,
            formatting: { namesBehavior: "never" },
        });
        expect(resolvePresetMacros("{{chat_history}}", neverCtx)).toBe(
            "Hello there\nGreetings",
        );

        // 'force' in 1-on-1 chat
        const forceCtx = createMacroContext({
            messages,
            formatting: { namesBehavior: "force" },
        });
        expect(resolvePresetMacros("{{chat_history}}", forceCtx)).toBe(
            "Hello there\nGreetings",
        );
    });
});

function createMacroContext(overrides: Partial<MacroContext> = {}): MacroContext {
    const character = overrides.character ?? createCharacter();

    return {
        character,
        messages: overrides.messages ?? [message("m1", "user", "Hello")],
        mode: "chat",
        personaDescription: "A tester.",
        personaName: "Anon",
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
