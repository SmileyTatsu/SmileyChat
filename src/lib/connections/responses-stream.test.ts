import { describe, expect, test } from "bun:test";

import { consumeResponsesApiStream } from "./responses-stream";

describe("consumeResponsesApiStream", () => {
    test("reads response.output_text.delta events", async () => {
        const chunks: string[] = [];
        const response = new Response(
            [
                'data: {"type":"response.created","response":{"model":"grok-4.5"}}',
                "",
                'data: {"type":"response.output_text.delta","delta":"Hello "}',
                "",
                'data: {"type":"response.output_text.delta","delta":"world"}',
                "",
                "data: [DONE]",
                "",
            ].join("\n"),
            {
                headers: {
                    "Content-Type": "text/event-stream",
                },
            },
        );

        const result = await consumeResponsesApiStream(
            response,
            {
                messages: [],
                onToken: (token) => {
                    chunks.push(token);
                },
            },
            {
                emptyMessage: "empty",
                provider: "xai",
            },
        );

        expect(chunks).toEqual(["Hello ", "world"]);
        expect(result).toEqual({
            message: "Hello world",
            provider: "xai",
            model: "grok-4.5",
        });
    });
});
