import { describe, expect, test } from "bun:test";

import type { Message, SmileyCharacter } from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { renderStoryString, resolvePresetMacros, type MacroContext } from "./macros";
import type { PresetPrompt, SmileyPreset } from "./types";

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

    test("matches nested preset conditional blocks with a stack", () => {
        const withDescription = createMacroContext();
        expect(
            resolvePresetMacros(
                "{{#if description}}outer {{#if personality}}inner{{else}}fallback{{/if}} done{{else}}missing{{/if}}",
                withDescription,
            ),
        ).toBe("outer fallback done");

        const withoutDescription = createMacroContext({
            character: {
                ...createCharacter(),
                data: { ...createCharacter().data, description: "" },
            },
        });
        expect(
            resolvePresetMacros(
                "{{#if description}}outer {{#if personality}}inner{{else}}fallback{{/if}} done{{else}}missing{{/if}}",
                withoutDescription,
            ),
        ).toBe("missing");
    });

    test("evaluates mixed nested blocks and adjacent branches", () => {
        expect(
            resolvePresetMacros(
                "{{#unless personality}}A{{#if description}}{{char}}{{else}}B{{/if}}{{else}}C{{/unless}}|{{#if personality}}D{{else}}{{#unless description}}E{{else}}F{{/unless}}{{/if}}",
                createMacroContext(),
            ),
        ).toBe("ALuna|F");
    });

    test("renders deeply nested imported conditionals without overflowing the call stack", () => {
        const template =
            "{{#if description}}".repeat(12000) + "ok" + "{{/if}}".repeat(12000);
        expect(resolvePresetMacros(template, createMacroContext())).toBe("ok");
    });

    test("preserves unfinished conditional syntax", () => {
        const template =
            "{{#if description}}text{{#unless personality}}unfinished{{/if}}";
        expect(resolvePresetMacros(template, createMacroContext())).toBe(template);
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

    test("resolves {{random::}} to one of its options", () => {
        const context = createMacroContext();
        const options = ["sunny", "rainy", "cloudy"];
        const resolved = resolvePresetMacros("{{random::sunny::rainy::cloudy}}", context);

        expect(options).toContain(resolved);
    });

    test("resolves {{random::}} with a comma separated list and trims options", () => {
        const context = createMacroContext();
        const resolved = resolvePresetMacros("{{random:: one, two , three }}", context);

        expect(["one", "two", "three"]).toContain(resolved);
    });

    test("keeps a {{random}} macro without options literal", () => {
        const context = createMacroContext();

        expect(resolvePresetMacros("{{random}}", context)).toBe("{{random}}");
        expect(resolvePresetMacros("{{random::}}", context)).toBe("{{random::}}");
    });

    test("rolls different options across compilations", () => {
        const context = createMacroContext();
        const seen = new Set<string>();

        for (let index = 0; index < 200; index += 1) {
            seen.add(resolvePresetMacros("{{random::a::b::c}}", context));
        }

        expect(seen.size).toBeGreaterThan(1);
    });

    test("keeps {{pick::}} stable for every occurrence in the same turn", () => {
        const context = createMacroContext();
        const resolved = resolvePresetMacros(
            "{{pick::red::green::blue}}|{{pick::red::green::blue}}",
            context,
        );
        const [first, second] = resolved.split("|");

        expect(["red", "green", "blue"]).toContain(first);
        expect(second).toBe(first);
        expect(resolvePresetMacros("{{pick::red::green::blue}}", context)).toBe(first);
    });

    test("changes {{pick::}} when the chat turn moves on", () => {
        const options = ["red", "green", "blue", "amber", "violet"];
        const template = "{{pick::red::green::blue::amber::violet}}";
        const seen = new Set<string>();

        for (let index = 0; index < 40; index += 1) {
            seen.add(
                resolvePresetMacros(
                    template,
                    createMacroContext({
                        messages: [message(`m-${index}`, "user", "next turn")],
                    }),
                ),
            );
        }

        expect(seen.size).toBeGreaterThan(1);
        for (const value of seen) {
            expect(options).toContain(value);
        }
    });

    test("resolves prompt state for enabled and disabled preset prompts", () => {
        const context = createMacroContext({ preset: createPreset() });

        expect(
            resolvePresetMacros("{{isPrompt::🍂 | Voice & SFX (Lewd)}}", context),
        ).toBe("true");
        expect(resolvePresetMacros("{{hasPrompt::voice}}", context)).toBe("true");
        expect(resolvePresetMacros("{{isPrompt::Style & Prose}}", context)).toBe("");
        expect(
            resolvePresetMacros("{{isPrompt::  🍂 |  VOICE & sfx (lewd) }}", context),
        ).toBe("true");
        expect(resolvePresetMacros("{{isPrompt::Never Listed}}", context)).toBe("");
    });

    test("gates conditional branches on prompt state", () => {
        const context = createMacroContext({ preset: createPreset() });

        expect(
            resolvePresetMacros(
                "{{#if isPrompt::🍂 | Voice & SFX (Lewd)}}on{{else}}off{{/if}}",
                context,
            ),
        ).toBe("on");
        expect(
            resolvePresetMacros(
                "{{#if isPrompt::Style & Prose}}on{{else}}off{{/if}}",
                context,
            ),
        ).toBe("off");
        expect(
            resolvePresetMacros(
                "{{#unless isPrompt::Style & Prose}}off{{/unless}}",
                context,
            ),
        ).toBe("off");
    });

    test("leaves unresolvable prompt state macros literal", () => {
        const withoutPreset = createMacroContext();

        expect(resolvePresetMacros("{{isPrompt::Any}}", withoutPreset)).toBe(
            "{{isPrompt::Any}}",
        );

        const context = createMacroContext({ preset: createPreset() });
        expect(resolvePresetMacros("{{isPrompt::Typo Title}}", context)).toBe(
            "{{isPrompt::Typo Title}}",
        );
        expect(resolvePresetMacros("{{isPrompt::}}", context)).toBe("{{isPrompt::}}");
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

function createPreset(): SmileyPreset {
    const prompts = [
        presetPrompt("voice", "🍂 | Voice & SFX (Lewd)"),
        presetPrompt("style", "Style & Prose"),
        presetPrompt("unlisted", "Never Listed"),
    ];

    return {
        id: "preset-1",
        title: "Test preset",
        prompts,
        promptOrder: [
            { promptId: "voice", enabled: true },
            { promptId: "style", enabled: false },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function presetPrompt(id: string, title: string): PresetPrompt {
    return {
        id,
        title,
        role: "system",
        content: "",
        systemPrompt: false,
        marker: true,
        injectionPosition: "none",
        injectionDepth: 0,
        forbidOverrides: false,
    };
}

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
