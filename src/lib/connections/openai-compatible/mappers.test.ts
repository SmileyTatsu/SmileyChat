import { describe, expect, test } from "bun:test";
import { createChatCompletionBody, normalizeChatCompletion } from "./mappers";

describe("OpenAI-compatible connection mappers", () => {
    test("adds reasoning_effort when enabled", () => {
        const body = createChatCompletionBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                baseUrl: "https://api.openai.com/v1",
                model: { source: "default", id: "gpt-5.5" },
                reasoning: {
                    enabled: true,
                    effort: "high",
                    wireFormat: "chat-reasoning-effort",
                },
            },
        );

        expect(body.max_completion_tokens).toBe(1000);
        expect(body.reasoning_effort).toBe("high");
        expect(body.reasoning).toBeUndefined();
    });

    test("uses configured max_completion_tokens", () => {
        const body = createChatCompletionBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                baseUrl: "https://api.openai.com/v1",
                maxCompletionTokens: 250,
                model: { source: "default", id: "gpt-5.5" },
            },
        );

        expect(body.max_completion_tokens).toBe(250);
    });

    test("maps standard preset generation settings", () => {
        const body = createChatCompletionBody(
            {
                generation: {
                    frequencyPenalty: 0.2,
                    presencePenalty: 0.4,
                    seed: 123,
                    stopSequences: ["END"],
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.9,
                },
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                baseUrl: "https://api.openai.com/v1",
                maxCompletionTokens: 250,
                model: { source: "default", id: "gpt-5.5" },
            },
        );

        expect(body).toMatchObject({
            frequency_penalty: 0.2,
            max_completion_tokens: 250,
            presence_penalty: 0.4,
            seed: 123,
            stop: ["END"],
            temperature: 0.7,
            top_p: 0.9,
        });
        expect("top_k" in body).toBe(false);
    });

    test("adds root reasoning object and preserves reasoning history in compatible mode", () => {
        const body = createChatCompletionBody(
            {
                messages: [],
                promptMessages: [
                    {
                        role: "assistant",
                        content: "Previous answer",
                        reasoning: "Previous reasoning",
                        reasoningDetails: [{ type: "reasoning_details" }],
                    },
                    { role: "user", content: "Continue" },
                ],
            },
            {
                baseUrl: "http://127.0.0.1:11434/v1",
                model: { source: "custom", id: "reasoning-model" },
                reasoning: {
                    enabled: true,
                    effort: "medium",
                    wireFormat: "chat-reasoning-object",
                },
            },
        );

        expect(body.reasoning_effort).toBeUndefined();
        expect(body.reasoning).toEqual({ effort: "medium" });
        expect(body.messages[0]).toMatchObject({
            role: "assistant",
            content: "Previous answer",
            reasoning: "Previous reasoning",
            reasoning_details: [{ type: "reasoning_details" }],
        });
    });

    test("strips reasoning history when reasoning is disabled", () => {
        const body = createChatCompletionBody(
            {
                messages: [],
                promptMessages: [
                    {
                        role: "assistant",
                        content: "Previous answer",
                        reasoning: "Previous reasoning",
                        reasoningDetails: [{ type: "reasoning_details" }],
                    },
                ],
            },
            {
                baseUrl: "https://api.openai.com/v1",
                model: { source: "default", id: "gpt-5.5" },
            },
        );

        expect(body.messages[0]).toEqual({
            role: "assistant",
            content: "Previous answer",
        });
    });

    test("normalizes provider-returned reasoning", () => {
        const result = normalizeChatCompletion({
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 1,
            model: "reasoning-model",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Hello",
                        reasoning: "Reasoned first",
                        reasoning_details: [{ type: "reasoning_details" }],
                    },
                    finish_reason: "stop",
                },
            ],
        });

        expect(result).toMatchObject({
            message: "Hello",
            provider: "openai-compatible",
            model: "reasoning-model",
            reasoning: "Reasoned first",
            reasoningDetails: [{ type: "reasoning_details" }],
        });
    });
});
