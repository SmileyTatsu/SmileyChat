import { afterEach, describe, expect, test } from "bun:test";
import { createGoogleAIConnection, googleAIUploadBaseUrl } from "./adapter";

const originalFetch = globalThis.fetch;

describe("Google AI connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("streams thought summaries and answer tokens separately", async () => {
        globalThis.fetch = (async () =>
            new Response(
                [
                    'data: {"candidates":[{"content":{"parts":[{"text":"Reasoning ","thought":true}]}}],"modelVersion":"gemini-test"}',
                    "",
                    'data: {"candidates":[{"content":{"parts":[{"text":"answer","thoughtSignature":"signature-a"}]}}],"modelVersion":"gemini-test"}',
                    "",
                ].join("\n"),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                    },
                },
            )) as unknown as typeof fetch;
        const adapter = createGoogleAIConnection({
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            model: { source: "default", id: "gemini-test" },
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
            provider: "google-ai",
            model: "gemini-test",
        });
        expect(result.reasoningDetails).toEqual({
            googleAI: {
                parts: [
                    {
                        text: "Reasoning ",
                        thought: true,
                    },
                    {
                        text: "answer",
                        thoughtSignature: "signature-a",
                    },
                ],
                visibleText: "answer",
            },
        });
    });

    test("builds the resumable upload base URL before the API version", () => {
        expect(
            googleAIUploadBaseUrl("https://generativelanguage.googleapis.com/v1beta"),
        ).toBe("https://generativelanguage.googleapis.com/upload/v1beta");
        expect(googleAIUploadBaseUrl("https://example.com/v1")).toBe(
            "https://example.com/upload/v1",
        );
    });
});
