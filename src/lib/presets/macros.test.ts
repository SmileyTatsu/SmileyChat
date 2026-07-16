import { describe, expect, test } from "bun:test";

import type { Message, SmileyCharacter } from "#frontend/types";

import { defaultCharacterData } from "../characters/defaults";
import { resolvePresetMacros, type MacroContext } from "./macros";

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
