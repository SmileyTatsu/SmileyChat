import { describe, expect, test } from "bun:test";

import { createOpenRouterChatCompletionBody } from "./mappers";

describe("OpenRouter connection mappers", () => {
    test("adds max_completion_tokens", () => {
        const body = createOpenRouterChatCompletionBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                maxCompletionTokens: 250,
                model: { source: "api", id: "openai/gpt-5.5" },
                providerPreferences: {},
            },
        );

        expect(body.max_completion_tokens).toBe(250);
        expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    test("maps OpenRouter sampler settings", () => {
        const body = createOpenRouterChatCompletionBody(
            {
                generation: {
                    frequencyPenalty: 0.2,
                    minP: 0.05,
                    presencePenalty: 0.4,
                    repetitionPenalty: 1.05,
                    seed: 123,
                    stopSequences: ["END"],
                    temperature: 0.75,
                    topA: 0.1,
                    topK: 40,
                    topP: 0.9,
                },
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                maxCompletionTokens: 250,
                model: { source: "api", id: "anthropic/claude-sonnet-4.6" },
                providerPreferences: {},
            },
        );

        expect(body).toMatchObject({
            frequency_penalty: 0.2,
            max_completion_tokens: 250,
            min_p: 0.05,
            presence_penalty: 0.4,
            repetition_penalty: 1.05,
            seed: 123,
            stop: ["END"],
            temperature: 0.75,
            top_a: 0.1,
            top_k: 40,
            top_p: 0.9,
        });
    });

    test("filters sampler settings by selected model supported parameters", () => {
        const body = createOpenRouterChatCompletionBody(
            {
                generation: {
                    frequencyPenalty: 0.2,
                    minP: 0.05,
                    temperature: 0.75,
                    topK: 40,
                    topP: 0.9,
                },
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                maxCompletionTokens: 250,
                model: {
                    source: "api",
                    id: "openai/gpt-5.5",
                    supportedParameters: ["temperature", "top_p"],
                },
                providerPreferences: {},
            },
        );

        expect(body.max_completion_tokens).toBe(250);
        expect(body.temperature).toBe(0.75);
        expect(body.top_p).toBe(0.9);
        expect(body.top_k).toBeUndefined();
        expect(body.min_p).toBeUndefined();
        expect(body.frequency_penalty).toBeUndefined();
    });

    test("does not pass preset streaming overrides as provider parameters", () => {
        const body = createOpenRouterChatCompletionBody(
            {
                generation: { streaming: false },
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
                stream: true,
            },
            {
                maxCompletionTokens: 250,
                model: { source: "api", id: "openai/gpt-5.5" },
                providerPreferences: {},
            },
        );

        expect(body.stream).toBeTrue();
        expect(body).not.toHaveProperty("streaming");
    });
});
