import { describe, expect, test } from "bun:test";

import { defaultCharacterData } from "#frontend/lib/characters/defaults";
import type { ChatSession, SmileyCharacter } from "#frontend/types";

import { promptCharacterForGeneration } from "./use-group-chat-generation";

describe("promptCharacterForGeneration", () => {
    test("keeps each joined member card together and resolves card macros per member", () => {
        const alpha = character("alpha", "Alpha", {
            description: "{{scenario}} {{// card-only note}}",
            personality: "{{char}} personality",
            scenario: "{{PERSONALITY}}; Alpha scenario",
            system_prompt: "System for {{char}}",
            post_history_instructions: "Remember {{char}}",
        });
        const beta = character("beta", "Beta", {
            description: "{{scenario}} {{// card-only note}}",
            personality: "{{char}} personality",
            scenario: "{{PERSONALITY}}; Beta scenario",
            system_prompt: "System for {{char}}",
            post_history_instructions: "Remember {{char}}",
        });

        const promptCharacter = promptCharacterForGeneration({
            activeSpeaker: beta,
            groupCharacters: [alpha, beta],
            sourceChat: groupChat([alpha, beta]),
        });

        expect(promptCharacter.data.description).toBe(
            [
                "Beta:\nDescription:\nBeta personality; Beta scenario",
                "Personality:\nBeta personality",
                "Scenario:\nBeta personality; Beta scenario",
                "System prompt:\nSystem for Beta",
                "Post-history instructions:\nRemember Beta",
                "Alpha:\nDescription:\nAlpha personality; Alpha scenario",
                "Personality:\nAlpha personality",
                "Scenario:\nAlpha personality; Alpha scenario",
                "System prompt:\nSystem for Alpha",
                "Post-history instructions:\nRemember Alpha",
            ].join("\n\n"),
        );
        expect(promptCharacter.data.personality).toBe("");
        expect(promptCharacter.data.post_history_instructions).toBe("");
        expect(promptCharacter.data.system_prompt).toBe(
            "This is a group chat. The active speaker for the next reply is Beta.",
        );
    });

    test("uses a scenario override without regrouping member cards", () => {
        const alpha = character("alpha", "Alpha", { scenario: "Alpha scenario" });
        const beta = character("beta", "Beta", { scenario: "Beta scenario" });

        const promptCharacter = promptCharacterForGeneration({
            activeSpeaker: alpha,
            groupCharacters: [alpha, beta],
            sourceChat: groupChat([alpha, beta], { scenarioOverride: "Shared scene" }),
        });

        expect(promptCharacter.data.description).not.toContain("Alpha scenario");
        expect(promptCharacter.data.description).not.toContain("Beta scenario");
        expect(promptCharacter.data.scenario).toBe("Shared scene");
    });

    test("keeps swap-card generation scoped to the active speaker", () => {
        const alpha = character("alpha", "Alpha", { description: "Alpha description" });
        const beta = character("beta", "Beta", { description: "Beta description" });

        const promptCharacter = promptCharacterForGeneration({
            activeSpeaker: beta,
            groupCharacters: [alpha, beta],
            sourceChat: groupChat([alpha, beta], {
                generationMode: "swap-character-cards",
                scenarioOverride: "Shared scene",
            }),
        });

        expect(promptCharacter.data.description).toBe("Beta description");
        expect(promptCharacter.data.scenario).toBe("Shared scene");
    });
});

function character(
    id: string,
    name: string,
    data: Partial<SmileyCharacter["data"]> = {},
): SmileyCharacter {
    return {
        id,
        version: 1,
        data: { ...defaultCharacterData, ...data, name, extensions: {} },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function groupChat(
    characters: SmileyCharacter[],
    group: Partial<NonNullable<ChatSession["group"]>> = {},
): ChatSession {
    return {
        id: "chat-group",
        version: 1,
        kind: "group",
        characterId: characters[0]?.id ?? "",
        members: characters.map((character, order) => ({
            characterId: character.id,
            name: character.data.name,
            order,
        })),
        group: {
            replyOrder: "natural",
            generationMode: "join-character-cards",
            ...group,
        },
        defaultTitle: "Test group",
        mode: "chat",
        messages: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
