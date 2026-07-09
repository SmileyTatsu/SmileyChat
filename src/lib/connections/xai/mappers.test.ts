import { describe, expect, test } from "bun:test";

import {
    createXAIChatCompletionBody,
    createXAIResponsesBody,
    normalizeXAIChatCompletion,
    normalizeXAIResponsesResponse,
} from "./mappers";

describe("xAI connection mappers", () => {
    test("builds a chat completion payload with prompt messages", () => {
        const body = createXAIChatCompletionBody(
            {
                messages: [],
                promptMessages: [
                    { role: "developer", content: "Follow the house style." },
                    { role: "user", content: "Hello" },
                ],
            },
            {
                baseUrl: "https://api.x.ai/v1",
                model: { source: "default", id: "grok-4.5" },
                maxCompletionTokens: 250,
            },
        );

        expect(body).toMatchObject({
            model: "grok-4.5",
            max_completion_tokens: 250,
            stream: false,
            messages: [
                { role: "system", content: "Follow the house style." },
                { role: "user", content: "Hello" },
            ],
        });
    });

    test("maps standard preset generation settings without unsupported fields", () => {
        const body = createXAIChatCompletionBody(
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
                baseUrl: "https://api.x.ai/v1",
                model: { source: "default", id: "grok-4.5" },
            },
        );

        expect(body).toMatchObject({
            frequency_penalty: 0.2,
            presence_penalty: 0.4,
            seed: 123,
            stop: ["END"],
            temperature: 0.7,
            top_p: 0.9,
        });
        expect("top_k" in body).toBe(false);
    });

    test("adds reasoning effort and filters incompatible reasoning fields", () => {
        const body = createXAIChatCompletionBody(
            {
                generation: {
                    frequencyPenalty: 0.2,
                    presencePenalty: 0.4,
                    stopSequences: ["END"],
                    temperature: 0.7,
                },
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                baseUrl: "https://api.x.ai/v1",
                model: { source: "default", id: "grok-4.5" },
                reasoning: { enabled: true, effort: "high" },
            },
        );

        expect(body.reasoning_effort).toBe("high");
        expect(body.temperature).toBe(0.7);
        expect(body.frequency_penalty).toBeUndefined();
        expect(body.presence_penalty).toBeUndefined();
        expect(body.stop).toBeUndefined();
    });

    test("preserves image content parts", () => {
        const content = [
            { type: "text" as const, text: "Describe this image." },
            {
                type: "image_url" as const,
                image_url: { url: "data:image/png;base64,abc" },
            },
        ];
        const body = createXAIChatCompletionBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content }],
            },
            {
                baseUrl: "https://api.x.ai/v1",
                model: { source: "default", id: "grok-4.5" },
            },
        );

        expect(body.messages[0]?.content).toEqual(content);
    });

    test("builds a Responses payload with file inputs", () => {
        const body = createXAIResponsesBody(
            {
                messages: [],
                promptMessages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Summarize this." },
                            {
                                type: "file",
                                file: {
                                    filename: "notes.txt",
                                    url: "file-123",
                                },
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: "data:image/png;base64,abc",
                                },
                            },
                        ],
                    },
                ],
            },
            {
                baseUrl: "https://api.x.ai/v1",
                model: { source: "default", id: "grok-4.5" },
                reasoning: { enabled: true, effort: "high" },
            },
        );

        expect(body.input[0]).toEqual({
            role: "user",
            content: [
                { type: "input_text", text: "Summarize this." },
                { type: "input_file", file_id: "file-123", filename: "notes.txt" },
                { type: "input_image", image_url: "data:image/png;base64,abc" },
            ],
        });
        expect(body.reasoning).toEqual({ effort: "high" });
    });

    test("normalizes assistant responses", () => {
        const result = normalizeXAIChatCompletion({
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 1,
            model: "grok-4.5",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Hello",
                        reasoning_content: "Reasoned first",
                    },
                    finish_reason: "stop",
                },
            ],
        });

        expect(result).toMatchObject({
            message: "Hello",
            provider: "xai",
            model: "grok-4.5",
            reasoning: "Reasoned first",
        });
        expect(result.raw).toBeTruthy();
    });

    test("normalizes Responses reasoning summaries separately from visible output", () => {
        const result = normalizeXAIResponsesResponse({
            id: "response-test",
            model: "grok-4.5",
            output: [
                {
                    type: "message",
                    content: [
                        {
                            type: "output_text",
                            text: "Visible answer.",
                        },
                    ],
                },
                {
                    type: "reasoning",
                    summary: [
                        {
                            type: "summary_text",
                            text: "Reasoning summary.",
                        },
                    ],
                },
            ],
        });

        expect(result).toMatchObject({
            message: "Visible answer.",
            provider: "xai",
            model: "grok-4.5",
            reasoning: "Reasoning summary.",
        });
    });

    test("throws for empty assistant responses", () => {
        expect(() =>
            normalizeXAIChatCompletion({
                id: "chatcmpl-test",
                object: "chat.completion",
                created: 1,
                model: "grok-4.5",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "",
                        },
                        finish_reason: "stop",
                    },
                ],
            }),
        ).toThrow("xAI response did not include message content.");
    });
});
