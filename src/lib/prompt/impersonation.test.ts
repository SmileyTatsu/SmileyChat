import { describe, expect, test } from "bun:test";

import type { Message, SmileyPersona } from "#frontend/types";
import { defaultCharacter } from "../characters/defaults";
import type { ChatGenerationRequest, ConnectionAdapter } from "../connections/types";
import { compilePresetMessages } from "../presets/compile";
import { createDefaultPreset } from "../presets/defaults";
import { resolvePresetMacros, renderStoryString } from "../presets/macros";
import { createImpersonationContext, generateImpersonationDraft } from "./impersonation";

const character = {
    ...defaultCharacter,
    id: "char-luna",
    data: {
        ...defaultCharacter.data,
        name: "Luna",
        description: "{{char}} is a moon explorer who knows {{user}}.",
        personality: "Curious.",
        scenario: "{{char}} meets {{user}} at the observatory.",
        system_prompt: "Write only for {{char}}, never {{user}}.",
    },
};
const persona: SmileyPersona = {
    id: "persona-alex",
    version: 1,
    name: "Alex",
    description: "{{user}} is a telescope maker helping {{char}}.",
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
};
const messages: Message[] = [
    {
        id: "user-1",
        role: "user",
        author: "Alex",
        authorPersonaId: persona.id,
        createdAt: character.createdAt,
        activeSwipeIndex: 1,
        swipes: [
            { id: "old", content: "Old inactive text", createdAt: character.createdAt },
            { id: "new", content: "Hello {{char}}!", createdAt: character.createdAt },
        ],
    },
    {
        id: "char-1",
        role: "character",
        author: "Luna",
        authorCharacterId: character.id,
        createdAt: character.createdAt,
        activeSwipeIndex: 0,
        swipes: [
            {
                id: "reply",
                content: "Shall we look at the stars?",
                createdAt: character.createdAt,
            },
        ],
    },
];
const context = () =>
    createImpersonationContext({
        character,
        persona,
        messages,
        mode: "chat",
        userStatus: "online",
    });
const macroContext = () => {
    const reversed = context();
    return {
        ...reversed,
        personaName: reversed.persona.name,
        personaDescription: reversed.persona.description,
        mode: "chat" as const,
        userStatus: "online" as const,
    };
};

describe("impersonation prompt", () => {
    test("reverses macros and descriptions while preserving the real actors in contextual facts", () => {
        const source = structuredClone({ character, persona, messages });
        const reversed = context();
        expect(
            resolvePresetMacros("{{char}} / {{user}} / {{persona_name}}", macroContext()),
        ).toBe("Alex / Luna / Luna");
        expect(reversed.character.data.description).toBe(
            "Alex is a telescope maker helping Luna.",
        );
        expect(reversed.persona.description).toBe(
            "Luna is a moon explorer who knows Alex.\n\nCurious.",
        );
        expect(reversed.character.data.scenario).toBe(
            "Luna meets Alex at the observatory.",
        );
        expect(resolvePresetMacros("{{char_system_prompt}}", macroContext())).toBe(
            "Write only for Alex, never Luna.",
        );
        expect(
            renderStoryString(
                "{{char}}: {{description}}\n{{user}}: {{persona}}",
                macroContext(),
            ),
        ).toBe(
            "Alex: Alex is a telescope maker helping Luna.\nLuna: Luna is a moon explorer who knows Alex.\n\nCurious.",
        );
        expect({ character, persona, messages }).toEqual(source);
    });

    test("compiles active swipes as reversed chat turns without changing history", () => {
        const compiled = compilePresetMessages(createDefaultPreset(), macroContext());
        const history = compiled.filter((message) => message.speakerName);
        expect(history).toEqual([
            expect.objectContaining({
                role: "assistant",
                speakerName: "Alex",
                content: "Alex: Hello Luna!",
            }),
            expect.objectContaining({
                role: "user",
                speakerName: "Luna",
                content: "Luna: Shall we look at the stars?",
            }),
        ]);
        expect(messages[0].role).toBe("user");
        expect(messages[0].swipes[1].content).toBe("Hello {{char}}!");
    });

    test("reverses explicit prompt roles and suppresses historical tool execution", () => {
        const withTools = {
            ...messages[1],
            metadata: { promptRole: "assistant" as const },
            swipes: [
                {
                    ...messages[1].swipes[0],
                    toolActivities: [
                        {
                            call: {
                                id: "tool-1",
                                name: "generate_image",
                                argumentsText: "{}",
                            },
                            result: {
                                toolCallId: "tool-1",
                                name: "generate_image",
                                content: "Done",
                                imageContext: "Night sky",
                            },
                        },
                    ],
                },
            ],
        };
        const reversed = createImpersonationContext({
            character,
            persona,
            messages: [withTools],
            mode: "rp",
            userStatus: "online",
        });
        expect(reversed.messages[0].metadata?.promptRole).toBe("user");
        expect(reversed.messages[0].swipes[0].toolActivities?.[0].result).toEqual(
            expect.objectContaining({
                suppressHistoryProtocol: true,
                imageContext: "Night sky",
            }),
        );
        const compiled = compilePresetMessages(createDefaultPreset(), {
            ...macroContext(),
            messages: reversed.messages,
        });
        expect(compiled.some((message) => message.toolCalls || message.toolResult)).toBe(
            false,
        );
        expect(
            compiled.some((message) => String(message.content).includes("Night sky")),
        ).toBe(true);
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
function adapter(generate: ConnectionAdapter["generate"]): ConnectionAdapter {
    return { id: "test", label: "Test", buildPayload: () => ({}), generate };
}

describe("impersonation draft generation", () => {
    test("streams into the draft, uses the final result, and never offers tools", async () => {
        const controller = new AbortController();
        const drafts: string[] = [];
        await generateImpersonationDraft({
            buildRequest: async () => ({
                messages: [],
                stream: true,
                tools: [{ name: "send", description: "Send", parameters: {} }],
            }),
            signal: controller.signal,
            onDraft: (draft) => drafts.push(draft),
            connection: adapter(async (request) => {
                expect(request.tools).toBeUndefined();
                expect(request.signal).toBe(controller.signal);
                request.onToken?.("I ");
                request.onToken?.("look up.");
                return { message: "I look up!", provider: "test" };
            }),
        });
        expect(drafts).toEqual(["I ", "I look up.", "I look up!"]);
    });

    test("fills a non-streaming result", async () => {
        const drafts: string[] = [];
        await generateImpersonationDraft({
            buildRequest: async () => ({ messages: [], stream: false }),
            signal: new AbortController().signal,
            onDraft: (draft) => drafts.push(draft),
            connection: adapter(async (request) => {
                expect(request.stream).toBe(false);
                return { message: "My next line.", provider: "test" };
            }),
        });
        expect(drafts).toEqual(["My next line."]);
    });

    test("abort during prompt preparation settles before preparation finishes", async () => {
        const controller = new AbortController();
        const prepared = deferred<ChatGenerationRequest>();
        let called = false;
        const pending = generateImpersonationDraft({
            buildRequest: () => prepared.promise,
            signal: controller.signal,
            onDraft: () => {},
            connection: adapter(async () => {
                called = true;
                return { message: "Late", provider: "test" };
            }),
        });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        prepared.resolve({ messages: [] });
        await Promise.resolve();
        expect(called).toBe(false);
    });

    test("abort keeps partial text and rejects late tokens even if the adapter ignores abort", async () => {
        const controller = new AbortController();
        const finished = deferred<{ message: string; provider: string }>();
        const started = deferred<ChatGenerationRequest>();
        const drafts: string[] = [];
        const pending = generateImpersonationDraft({
            buildRequest: async () => ({ messages: [] }),
            signal: controller.signal,
            onDraft: (draft) => drafts.push(draft),
            connection: adapter((request) => {
                request.onToken?.("Partial draft");
                started.resolve(request);
                return finished.promise;
            }),
        });
        const request = await started.promise;
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        request.onToken?.(" late token");
        finished.resolve({ message: "Late completed draft", provider: "test" });
        await Promise.resolve();
        expect(drafts).toEqual(["Partial draft"]);
    });

    test("provider failures keep partial text and propagate the error", async () => {
        const drafts: string[] = [];
        await expect(
            generateImpersonationDraft({
                buildRequest: async () => ({ messages: [] }),
                signal: new AbortController().signal,
                onDraft: (draft) => drafts.push(draft),
                connection: adapter(async (request) => {
                    request.onToken?.("Partial");
                    throw new Error("Connection lost");
                }),
            }),
        ).rejects.toThrow("Connection lost");
        expect(drafts).toEqual(["Partial"]);
    });
});
