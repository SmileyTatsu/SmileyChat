import { describe, expect, test } from "bun:test";

import { defaultCharacterData } from "#frontend/lib/characters/defaults";
import type { ChatSession, Message, SmileyCharacter } from "#frontend/types";

import {
    promptCharacterForGeneration,
    selectGenerationCharacter,
} from "./use-group-chat-generation";

describe("selectGenerationCharacter", () => {
    test("cycles through all members in list order without getting stuck in a 2-character loop", () => {
        const alpha = character("alpha", "Alpha");
        const beta = character("beta", "Beta");
        const gamma = character("gamma", "Gamma");
        const chat = groupChat([alpha, beta, gamma], {
            replyOrder: "list",
            allowSelfResponses: false,
        });

        // 1. Initial turn: no history -> Alpha
        const first = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [],
            sourceChat: chat,
        });
        expect(first?.id).toBe("alpha");

        // 2. Alpha just spoke -> Beta
        const msgA: Message = charMessage("alpha", "Alpha", "Hello from Alpha");
        const second = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [msgA],
            sourceChat: chat,
        });
        expect(second?.id).toBe("beta");

        // 3. Beta just spoke -> Gamma (must not loop back to Alpha!)
        const msgB: Message = charMessage("beta", "Beta", "Hello from Beta");
        const third = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [msgA, msgB],
            sourceChat: chat,
        });
        expect(third?.id).toBe("gamma");

        // 4. Gamma just spoke -> Alpha (cycle wraps)
        const msgC: Message = charMessage("gamma", "Gamma", "Hello from Gamma");
        const fourth = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [msgA, msgB, msgC],
            sourceChat: chat,
        });
        expect(fourth?.id).toBe("alpha");
    });

    test("never selects a muted character and returns undefined if all are muted", () => {
        const alpha = character("alpha", "Alpha");
        const beta = character("beta", "Beta");
        const gamma = character("gamma", "Gamma");

        // Alpha unmuted, Beta muted, Gamma muted
        const chatWithMuted = groupChat([alpha, beta, gamma], {
            replyOrder: "list",
            allowSelfResponses: false,
        });
        chatWithMuted.members![1].muted = true;
        chatWithMuted.members![2].muted = true;

        const msgA: Message = charMessage("alpha", "Alpha", "Turn 1");

        // Even though Alpha was the last speaker and self-responses are disabled,
        // Beta and Gamma are muted, so it must fall back to Alpha instead of picking a muted member.
        const next = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [msgA],
            sourceChat: chatWithMuted,
        });
        expect(next?.id).toBe("alpha");

        // If all members are muted:
        chatWithMuted.members![0].muted = true;
        const allMutedResult = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: [msgA],
            sourceChat: chatWithMuted,
        });
        expect(allMutedResult).toBeUndefined();
    });

    test("matches character mentions in natural order with punctuation, parentheses, and first names", () => {
        const nejire = character("nejire", "Nejire Hado (Hero)");
        const megumin = character("megumin", "Megumin [Archmage]");
        const luna = character("luna", "Luna");
        const chat = groupChat([nejire, megumin, luna], {
            replyOrder: "natural",
        });

        // Mention by first name with punctuation: "Hey Nejire!"
        const mentionNejire = selectGenerationCharacter({
            character: luna,
            groupCharacters: [nejire, megumin, luna],
            messages: [userMessage("Hey Nejire, what do you think?")],
            sourceChat: chat,
        });
        expect(mentionNejire?.id).toBe("nejire");

        // Mention with brackets cleaned: "Megumin"
        const mentionMegumin = selectGenerationCharacter({
            character: luna,
            groupCharacters: [nejire, megumin, luna],
            messages: [userMessage("I choose you, Megumin!")],
            sourceChat: chat,
        });
        expect(mentionMegumin?.id).toBe("megumin");
    });

    test("pooled order correctly tracks rounds and does not repeat characters within a round across user messages", () => {
        const alpha = character("alpha", "Alpha");
        const beta = character("beta", "Beta");
        const gamma = character("gamma", "Gamma");
        const chat = groupChat([alpha, beta, gamma], {
            replyOrder: "pooled",
            allowSelfResponses: false,
        });

        // Sequence: Alpha -> Beta -> Gamma (Round 1 complete) -> Alpha (starts Round 2)
        const messages: Message[] = [
            charMessage("alpha", "Alpha", "Turn 1"),
            charMessage("beta", "Beta", "Turn 2"),
            charMessage("gamma", "Gamma", "Turn 3"),
            charMessage("alpha", "Alpha", "Turn 4"),
        ];

        // Next speaker in Round 2 must only be Beta or Gamma, NEVER Alpha
        for (let run = 0; run < 20; run += 1) {
            const next = selectGenerationCharacter({
                character: alpha,
                groupCharacters: [alpha, beta, gamma],
                messages,
                sourceChat: chat,
            });
            expect(["beta", "gamma"]).toContain(next?.id ?? "");
            expect(next?.id).not.toBe("alpha");
        }

        // Sequence with interspersed user messages:
        // Alpha -> (user) -> Beta -> (user) -> Gamma -> (user) -> Alpha -> (user)
        const messagesWithUser: Message[] = [
            charMessage("alpha", "Alpha", "Turn 1"),
            userMessage("User reply 1"),
            charMessage("beta", "Beta", "Turn 2"),
            userMessage("User reply 2"),
            charMessage("gamma", "Gamma", "Turn 3"),
            userMessage("User reply 3"),
            charMessage("alpha", "Alpha", "Turn 4"),
            userMessage("User reply 4"),
        ];

        for (let run = 0; run < 20; run += 1) {
            const next = selectGenerationCharacter({
                character: alpha,
                groupCharacters: [alpha, beta, gamma],
                messages: messagesWithUser,
                sourceChat: chat,
            });
            expect(["beta", "gamma"]).toContain(next?.id ?? "");
            expect(next?.id).not.toBe("alpha");
        }

        // Sequence: Alpha -> Beta -> Gamma -> Alpha -> Beta
        // Round 2 has Alpha and Beta; next speaker MUST be Gamma!
        const messagesFinishingRound: Message[] = [
            charMessage("alpha", "Alpha", "Turn 1"),
            charMessage("beta", "Beta", "Turn 2"),
            charMessage("gamma", "Gamma", "Turn 3"),
            charMessage("alpha", "Alpha", "Turn 4"),
            charMessage("beta", "Beta", "Turn 5"),
        ];

        const mustBeGamma = selectGenerationCharacter({
            character: alpha,
            groupCharacters: [alpha, beta, gamma],
            messages: messagesFinishingRound,
            sourceChat: chat,
        });
        expect(mustBeGamma?.id).toBe("gamma");
    });
});

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

function charMessage(characterId: string, author: string, content: string): Message {
    return {
        id: `msg-${Math.random()}`,
        author,
        authorCharacterId: characterId,
        role: "character",
        createdAt: new Date().toISOString(),
        activeSwipeIndex: 0,
        swipes: [{ id: "swipe-1", content, createdAt: new Date().toISOString() }],
    };
}

function userMessage(content: string): Message {
    return {
        id: `msg-${Math.random()}`,
        author: "User",
        role: "user",
        createdAt: new Date().toISOString(),
        activeSwipeIndex: 0,
        swipes: [{ id: "swipe-1", content, createdAt: new Date().toISOString() }],
    };
}
