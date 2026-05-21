import { describe, expect, test } from "bun:test";

import { createAnthropicMessageBody, normalizeAnthropicResponse } from "./mappers";

describe("Anthropic connection mappers", () => {
    test("moves system and developer messages into top-level system", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    { role: "system", content: "System prompt" },
                    { role: "developer", content: "Developer prompt" },
                    { role: "user", content: "Hello" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body.system).toBe("System prompt\n\nDeveloper prompt");
        expect(body.max_tokens).toBe(1000);
        expect(body.messages).toEqual([
            {
                role: "user",
                content: "Hello",
            },
        ]);
    });

    test("uses configured max_tokens", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                maxTokens: 250,
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body.max_tokens).toBe(250);
    });

    test("maps Anthropic sampler settings and sends only temperature when top_p is also set", () => {
        const body = createAnthropicMessageBody(
            {
                generation: {
                    stopSequences: ["END"],
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.9,
                },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                maxTokens: 250,
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body).toMatchObject({
            max_tokens: 250,
            stop_sequences: ["END"],
            temperature: 0.7,
            top_k: 40,
        });
        expect(body.top_p).toBeUndefined();
    });

    test("omits sampling parameters and manual thinking budget for Claude Opus 4.7", () => {
        const body = createAnthropicMessageBody(
            {
                generation: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.9,
                },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-7" },
                thinking: {
                    mode: "enabled",
                    budgetTokens: 1024,
                    display: "summarized",
                },
            },
        );

        expect(body.temperature).toBeUndefined();
        expect(body.top_k).toBeUndefined();
        expect(body.top_p).toBeUndefined();
        expect(body.thinking).toEqual({
            type: "adaptive",
            display: "summarized",
        });
    });

    test("sends top_p when temperature is unset", () => {
        const body = createAnthropicMessageBody(
            {
                generation: {
                    topP: 0.9,
                },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-1-20250805" },
            },
        );

        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBe(0.9);
    });

    test("keeps interspersed system and developer messages in history", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    { role: "system", content: "System prompt" },
                    { role: "user", content: "First user" },
                    { role: "system", content: "Author note" },
                    { role: "assistant", content: "First assistant" },
                    { role: "developer", content: "Depth instruction" },
                    { role: "user", content: "Second user" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body.system).toBe("System prompt");
        expect(body.messages).toEqual([
            {
                role: "user",
                content: "First user\nAuthor note",
            },
            {
                role: "assistant",
                content: "First assistant",
            },
            {
                role: "user",
                content: "Depth instruction\nSecond user",
            },
        ]);
    });

    test("merges consecutive same-role turns", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    { role: "user", content: "First user" },
                    { role: "user", content: "Second user" },
                    { role: "assistant", content: "First assistant" },
                    { role: "assistant", content: "Second assistant" },
                    { role: "user", content: "Third user" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body.messages).toEqual([
            {
                role: "user",
                content: "First user\nSecond user",
            },
            {
                role: "assistant",
                content: "First assistant\nSecond assistant",
            },
            {
                role: "user",
                content: "Third user",
            },
        ]);
    });

    test("maps data URL images to Anthropic image blocks before text", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe this" },
                            {
                                type: "image_url",
                                image_url: {
                                    url: "data:image/png;base64,abc123",
                                },
                            },
                        ],
                    },
                ],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-sonnet-4-6" },
            },
        );

        expect(body.messages[0]?.content).toEqual([
            {
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "abc123",
                },
            },
            {
                type: "text",
                text: "Describe this",
            },
        ]);
    });

    test("adds adaptive thinking config", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [{ role: "user", content: "Think" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-7" },
                thinking: {
                    mode: "adaptive",
                    effort: "high",
                    display: "summarized",
                },
            },
        );

        expect(body.thinking).toEqual({
            type: "adaptive",
            effort: "high",
            display: "summarized",
        });
    });

    test("normalizes text and thinking blocks", () => {
        const result = normalizeAnthropicResponse({
            model: "claude-test",
            stop_reason: "end_turn",
            content: [
                {
                    type: "thinking",
                    thinking: "Reasoning summary.",
                    signature: "signature-a",
                },
                { type: "text", text: "Final" },
                { type: "text", text: " answer." },
            ],
            usage: {
                input_tokens: 12,
                output_tokens: 34,
            },
        });

        expect(result).toMatchObject({
            message: "Final answer.",
            reasoning: "Reasoning summary.",
            provider: "anthropic",
            model: "claude-test",
        });
        expect(result.reasoningDetails).toEqual({
            anthropic: {
                content: [
                    {
                        type: "thinking",
                        thinking: "Reasoning summary.",
                        signature: "signature-a",
                    },
                ],
                stopReason: "end_turn",
                usage: {
                    input_tokens: 12,
                    output_tokens: 34,
                },
                visibleText: "Final answer.",
            },
        });
    });
});
