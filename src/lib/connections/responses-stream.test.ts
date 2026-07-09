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

    test("separates reasoning deltas from visible output", async () => {
        const chunks: string[] = [];
        const reasoningChunks: string[] = [];
        const response = new Response(
            [
                'data: {"type":"response.created","response":{"model":"grok-4.5"}}',
                "",
                'data: {"type":"response.reasoning_text.delta","delta":"Reason "}',
                "",
                'data: {"type":"response.reasoning_summary_text.delta","delta":"summary"}',
                "",
                'data: {"type":"response.output_text.delta","delta":"Answer"}',
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
                onReasoningToken: (token) => {
                    reasoningChunks.push(token);
                },
            },
            {
                emptyMessage: "empty",
                provider: "xai",
            },
        );

        expect(chunks).toEqual(["Answer"]);
        expect(reasoningChunks).toEqual(["Reason ", "summary"]);
        expect(result).toEqual({
            message: "Answer",
            provider: "xai",
            model: "grok-4.5",
            reasoning: "Reason summary",
        });
    });

    test("separates reasoning summary parts from visible output parts", async () => {
        const response = new Response(
            [
                'data: {"type":"response.content_part.added","part":{"type":"summary_text","text":"Reasoning"}}',
                "",
                'data: {"type":"response.content_part.added","part":{"type":"output_text","text":"Answer"}}',
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
            { messages: [] },
            {
                emptyMessage: "empty",
                provider: "xai",
            },
        );

        expect(result).toMatchObject({
            message: "Answer",
            reasoning: "Reasoning",
        });
    });
});
