import { describe, expect, test } from "bun:test";

import { createAnthropicMessageBody, normalizeAnthropicResponse } from "./mappers";

describe("Anthropic connection mappers", () => {
    test("preserves leading system and developer prompt boundaries in top-level system", () => {
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

        expect(body.system).toEqual([
            { type: "text", text: "System prompt" },
            { type: "text", text: "Developer prompt" },
        ]);
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

    test("maps automatic prompt caching TTLs", () => {
        const request = {
            promptMessages: [{ role: "user" as const, content: "Hello" }],
            messages: [],
        };
        const baseConfig = {
            baseUrl: "https://api.anthropic.com/v1",
            model: { source: "default" as const, id: "claude-sonnet-4-6" },
        };

        expect(
            createAnthropicMessageBody(request, {
                ...baseConfig,
                promptCaching: { mode: "off" },
            }).cache_control,
        ).toBeUndefined();
        expect(
            createAnthropicMessageBody(request, {
                ...baseConfig,
                promptCaching: { mode: "auto", ttl: "5m" },
            }).cache_control,
        ).toEqual({ type: "ephemeral" });
        expect(
            createAnthropicMessageBody(request, {
                ...baseConfig,
                promptCaching: { mode: "auto", ttl: "1h" },
            }).cache_control,
        ).toEqual({ type: "ephemeral", ttl: "1h" });
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
                model: { source: "default", id: "claude-opus-4-6" },
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

    test("keeps the thinking wire contract when normalized sampling includes top_p", () => {
        const body = createAnthropicMessageBody(
            {
                generation: { temperature: 0.7, topP: 0.99 },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-6" },
                thinking: { mode: "enabled", budgetTokens: 512 },
            },
        );

        expect(body.temperature).toBe(1);
        expect(body.top_p).toBeUndefined();
    });

    test("allows temperature 1.0 and top_p >= 0.99 for backwards compatibility on post-Opus 4.6 models", () => {
        const temp1Body = createAnthropicMessageBody(
            {
                generation: {
                    temperature: 1.0,
                    topK: 40,
                    topP: 0.99,
                },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-7" },
            },
        );

        expect(temp1Body.temperature).toBe(1.0);
        expect(temp1Body.top_k).toBeUndefined();
        expect(temp1Body.top_p).toBeUndefined();

        const topPBody = createAnthropicMessageBody(
            {
                generation: {
                    topP: 0.99,
                    topK: 20,
                },
                promptMessages: [{ role: "user", content: "Hello" }],
                messages: [],
            },
            {
                baseUrl: "https://api.anthropic.com/v1",
                model: { source: "default", id: "claude-opus-4-7" },
            },
        );

        expect(topPBody.temperature).toBeUndefined();
        expect(topPBody.top_k).toBeUndefined();
        expect(topPBody.top_p).toBe(0.99);
    });

    test("correctly identifies all post-Opus 4.6 models (Sonnet 5, Fable 5, Opus 5, Sonnet 4.6, Opus 4.8)", () => {
        const postOpus46Models = [
            "claude-opus-5",
            "claude-sonnet-5",
            "claude-fable-5",
            "claude-opus-4-8",
            "claude-opus-4-7",
            "claude-sonnet-4-6",
        ];

        for (const modelId of postOpus46Models) {
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
                    model: { source: "default", id: modelId },
                },
            );

            expect(body.temperature).toBeUndefined();
            expect(body.top_k).toBeUndefined();
            expect(body.top_p).toBeUndefined();
        }

        const olderModels = [
            "claude-opus-4-6",
            "claude-opus-4-5-20251101",
            "claude-haiku-4-5-20251001",
            "claude-sonnet-4-5-20250929",
            "claude-opus-4-1-20250805",
        ];

        for (const modelId of olderModels) {
            const body = createAnthropicMessageBody(
                {
                    generation: {
                        temperature: 0.7,
                        topK: 40,
                    },
                    promptMessages: [{ role: "user", content: "Hello" }],
                    messages: [],
                },
                {
                    baseUrl: "https://api.anthropic.com/v1",
                    model: { source: "default", id: modelId },
                },
            );

            expect(body.temperature).toBe(0.7);
            expect(body.top_k).toBe(40);
        }
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

    test("labels interspersed system and developer messages as injected instruction context", () => {
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

        expect(body.system).toEqual([{ type: "text", text: "System prompt" }]);
        expect(body.messages).toEqual([
            {
                role: "user",
                content:
                    'First user\n<smileychat-instruction role="system">\nAuthor note\n</smileychat-instruction>',
            },
            {
                role: "assistant",
                content: "First assistant",
            },
            {
                role: "user",
                content:
                    '<smileychat-instruction role="developer">\nDepth instruction\n</smileychat-instruction>\nSecond user',
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

    test("maps uploaded file references to document blocks", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Summarize this." },
                            {
                                type: "file",
                                file: {
                                    filename: "notes.pdf",
                                    mime_type: "application/pdf",
                                    url: "file_123",
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
                type: "document",
                source: {
                    type: "file",
                    file_id: "file_123",
                },
                title: "notes.pdf",
            },
            {
                type: "text",
                text: "Summarize this.",
            },
        ]);
    });

    test("maps uploaded image file references to image blocks", () => {
        const body = createAnthropicMessageBody(
            {
                promptMessages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe this." },
                            {
                                type: "file",
                                file: {
                                    filename: "photo.png",
                                    mime_type: "image/png",
                                    url: "file_image_1",
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
                    type: "file",
                    file_id: "file_image_1",
                },
            },
            {
                type: "text",
                text: "Describe this.",
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
                cache_creation_input_tokens: 56,
                cache_read_input_tokens: 78,
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
                    cache_creation_input_tokens: 56,
                    cache_read_input_tokens: 78,
                },
                visibleText: "Final answer.",
            },
        });
    });
});
