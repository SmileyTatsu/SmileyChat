import { describe, expect, test } from "bun:test";

import { createNovelAIBody } from "./mappers";

describe("NovelAI connection mappers", () => {
    test("maps prompt messages and sampler settings", () => {
        const body = createNovelAIBody(
            {
                messages: [],
                promptMessages: [
                    { role: "system", content: "You are concise." },
                    { role: "user", content: "Say hello." },
                ],
                generation: {
                    temperature: 0.7,
                    topP: 0.9,
                    topK: 40,
                    frequencyPenalty: 0.1,
                    presencePenalty: 0.2,
                    stopSequences: ["User:"],
                },
                stream: true,
            },
            {
                maxOutputTokens: 123,
                model: {
                    source: "default",
                    id: "llama-3-erato-v1",
                },
            },
        );

        expect(body).toMatchObject({
            model: "llama-3-erato-v1",
            messages: [
                {
                    role: "system",
                    content: "You are concise.",
                },
                {
                    role: "user",
                    content: "Say hello.",
                },
            ],
            max_tokens: 123,
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            stop: ["User:"],
            stream: true,
            logit_bias: {
                "12488": -100,
                "128041": -100,
            },
        });
    });

    test("maps developer prompts to system messages", () => {
        const body = createNovelAIBody(
            {
                messages: [],
                promptMessages: [{ role: "developer", content: "Stay in character." }],
            },
            {
                model: {
                    source: "default",
                    id: "glm-4-6",
                },
            },
        );

        expect(body.messages).toEqual([
            {
                role: "system",
                content: "Stay in character.",
            },
        ]);
    });
});
