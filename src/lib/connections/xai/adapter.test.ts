import { afterEach, describe, expect, test } from "bun:test";

import { createXAIConnection } from "./adapter";

const originalFetch = globalThis.fetch;

describe("xAI connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("calls xAI chat completions with bearer auth", async () => {
        let requestUrl = "";
        let requestInit: RequestInit | undefined;

        globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
            requestUrl = String(url);
            requestInit = init;

            return new Response(
                JSON.stringify({
                    id: "chatcmpl-test",
                    object: "chat.completion",
                    created: 1,
                    model: "grok-4.5",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "ok",
                            },
                            finish_reason: "stop",
                        },
                    ],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }) as unknown as typeof fetch;

        const adapter = createXAIConnection({
            apiKey: "secret",
            baseUrl: "https://api.x.ai/v1",
            model: { source: "default", id: "grok-4.5" },
        });
        const result = await adapter.generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
        });

        expect(requestUrl).toBe("https://api.x.ai/v1/chat/completions");
        expect(requestInit?.method).toBe("POST");
        expect(requestInit?.headers).toMatchObject({
            Authorization: "Bearer secret",
            "Content-Type": "application/json",
        });
        expect(JSON.parse(String(requestInit?.body))).toMatchObject({
            model: "grok-4.5",
        });
        expect(result).toMatchObject({
            provider: "xai",
            message: "ok",
        });
    });

    test("uses xAI-specific error text", async () => {
        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    error: {
                        message: "bad key",
                    },
                }),
                { status: 401, headers: { "Content-Type": "application/json" } },
            )) as unknown as typeof fetch;

        const adapter = createXAIConnection({
            baseUrl: "https://api.x.ai/v1",
            model: { source: "default", id: "grok-4.5" },
        });

        await expect(
            adapter.generate({
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            }),
        ).rejects.toThrow(
            "xAI request failed at https://api.x.ai/v1/chat/completions: 401 bad key",
        );
    });

    test("streams answer and reasoning deltas", async () => {
        globalThis.fetch = (async () =>
            new Response(
                [
                    'data: {"model":"grok-4.5","choices":[{"delta":{"reasoning":"Thinking "}}]}',
                    "",
                    'data: {"model":"grok-4.5","choices":[{"delta":{"content":"answer"}}]}',
                    "",
                    "data: [DONE]",
                    "",
                ].join("\n"),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                    },
                },
            )) as unknown as typeof fetch;
        const adapter = createXAIConnection({
            baseUrl: "https://api.x.ai/v1",
            model: { source: "default", id: "grok-4.5" },
        });
        let streamedMessage = "";
        let streamedReasoning = "";

        const result = await adapter.generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
            stream: true,
            onToken: (token) => {
                streamedMessage += token;
            },
            onReasoningToken: (token) => {
                streamedReasoning += token;
            },
        });

        expect(streamedReasoning).toBe("Thinking ");
        expect(streamedMessage).toBe("answer");
        expect(result).toMatchObject({
            message: "answer",
            reasoning: "Thinking",
            provider: "xai",
            model: "grok-4.5",
        });
    });
});
