import { describe, expect, test } from "bun:test";

import { createNovelAIBody, createNovelAITextGenerationBody } from "./mappers";

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

    test("builds text generation requests for Erato and Kayra", () => {
        const body = createNovelAITextGenerationBody(
            {
                generation: {
                    frequencyPenalty: 0.2,
                    minP: 0.05,
                    presencePenalty: 0.4,
                    repetitionPenalty: 1.1,
                    temperature: 0.8,
                    topK: 50,
                    topP: 0.95,
                },
                messages: [],
                promptMessages: [
                    { role: "system", content: "Stay in character." },
                    { role: "user", content: "Hello." },
                    { role: "assistant", content: "Hi." },
                ],
            },
            {
                maxOutputTokens: 400,
                model: {
                    source: "default",
                    id: "kayra-v1",
                },
            },
        );

        expect(body).toEqual({
            model: "kayra-v1",
            input: "Stay in character.\n\nUser: Hello.\nAssistant: Hi.\nAssistant:",
            parameters: {
                use_string: true,
                max_length: 250,
                min_length: 1,
                temperature: 0.8,
                top_p: 0.95,
                top_k: 50,
                min_p: 0.05,
                repetition_penalty: 1.1,
                repetition_penalty_frequency: 0.2,
                repetition_penalty_presence: 0.4,
            },
        });
    });
});
