import { afterEach, describe, expect, test } from "bun:test";
import { createAnthropicConnection } from "./adapter";

const originalFetch = globalThis.fetch;

describe("Anthropic connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("streams thinking summaries and answer tokens separately", async () => {
        globalThis.fetch = (async () =>
            new Response(
                [
                    'data: {"type":"message_start","message":{"type":"message","role":"assistant","model":"claude-test","content":[],"usage":{"cache_creation_input_tokens":20,"cache_read_input_tokens":40}}}',
                    "",
                    'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
                    "",
                    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Reasoning "}}',
                    "",
                    'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"signature-a"}}',
                    "",
                    'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
                    "",
                    'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"answer"}}',
                    "",
                    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":15}}',
                    "",
                    'data: {"type":"message_stop"}',
                    "",
                ].join("\n"),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                    },
                },
            )) as unknown as typeof fetch;
        const adapter = createAnthropicConnection({
            baseUrl: "https://api.anthropic.com/v1",
            model: { source: "default", id: "claude-test" },
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

        expect(streamedReasoning).toBe("Reasoning ");
        expect(streamedMessage).toBe("answer");
        expect(result).toMatchObject({
            message: "answer",
            reasoning: "Reasoning",
            provider: "anthropic",
            model: "claude-test",
        });
        expect(result.reasoningDetails).toEqual({
            anthropic: {
                content: [
                    {
                        type: "thinking",
                        thinking: "Reasoning ",
                        signature: "signature-a",
                    },
                ],
                stopReason: "end_turn",
                usage: {
                    output_tokens: 15,
                    cache_creation_input_tokens: 20,
                    cache_read_input_tokens: 40,
                },
                visibleText: "answer",
            },
        });
    });

    test("sends configured automatic prompt caching in the Messages request", async () => {
        let requestBody: unknown;
        globalThis.fetch = (async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            return new Response(
                JSON.stringify({
                    model: "claude-test",
                    content: [{ type: "text", text: "Cached response" }],
                }),
                { status: 200 },
            );
        }) as typeof fetch;
        const adapter = createAnthropicConnection({
            baseUrl: "https://api.anthropic.com/v1",
            model: { source: "default", id: "claude-test" },
            promptCaching: { mode: "auto", ttl: "1h" },
        });

        await adapter.generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
        });

        expect(requestBody).toMatchObject({
            cache_control: { type: "ephemeral", ttl: "1h" },
        });
    });
});
