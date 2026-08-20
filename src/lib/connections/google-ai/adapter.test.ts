import { afterEach, describe, expect, test } from "bun:test";
import {
    createGoogleAIConnection,
    createGoogleAIGenerateUrl,
    googleAIUploadBaseUrl,
} from "./adapter";
import { normalizeGoogleAIBaseUrl } from "./config";

const originalFetch = globalThis.fetch;

describe("Google AI connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("normalizes base URLs by appending /v1beta or upgrading /v1", () => {
        expect(normalizeGoogleAIBaseUrl("")).toBe(
            "https://generativelanguage.googleapis.com/v1beta",
        );
        expect(normalizeGoogleAIBaseUrl(undefined)).toBe(
            "https://generativelanguage.googleapis.com/v1beta",
        );
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com"),
        ).toBe("https://generativelanguage.googleapis.com/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com/"),
        ).toBe("https://generativelanguage.googleapis.com/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com/v1"),
        ).toBe("https://generativelanguage.googleapis.com/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com/v1/"),
        ).toBe("https://generativelanguage.googleapis.com/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com/v1beta"),
        ).toBe("https://generativelanguage.googleapis.com/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://generativelanguage.googleapis.com/v1alpha"),
        ).toBe("https://generativelanguage.googleapis.com/v1alpha");
        expect(normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai")).toBe(
            "https://example.com/custom/google-ai/v1beta",
        );
        expect(normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai/")).toBe(
            "https://example.com/custom/google-ai/v1beta",
        );
        expect(normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai/v1")).toBe(
            "https://example.com/custom/google-ai/v1beta",
        );
        expect(normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai/v1/")).toBe(
            "https://example.com/custom/google-ai/v1beta",
        );
        expect(
            normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai/v1beta"),
        ).toBe("https://example.com/custom/google-ai/v1beta");
        expect(
            normalizeGoogleAIBaseUrl("https://example.com/custom/google-ai/v1alpha"),
        ).toBe("https://example.com/custom/google-ai/v1alpha");
    });

    test("creates generate URLs with normalized /v1beta path", () => {
        const url = createGoogleAIGenerateUrl(
            {
                baseUrl: "https://generativelanguage.googleapis.com",
                model: { source: "default", id: "gemini-3.1-pro-preview" },
            },
            false,
        );
        expect(url).toBe(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent",
        );

        const urlFromV1 = createGoogleAIGenerateUrl(
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1",
                model: { source: "default", id: "gemini-3.1-pro-preview" },
                apiKey: "my-key",
            },
            true,
        );
        expect(urlFromV1).toBe(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse&key=my-key",
        );
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
        expect(googleAIUploadBaseUrl("https://generativelanguage.googleapis.com")).toBe(
            "https://generativelanguage.googleapis.com/upload/v1beta",
        );
        expect(googleAIUploadBaseUrl("https://example.com/v1")).toBe(
            "https://example.com/upload/v1beta",
        );
        expect(
            googleAIUploadBaseUrl(
                "https://generativelanguage.googleapis.com/custom/path",
            ),
        ).toBe("https://generativelanguage.googleapis.com/custom/path/upload/v1beta");
        expect(googleAIUploadBaseUrl("https://example.com/v1alpha")).toBe(
            "https://example.com/upload/v1alpha",
        );
    });
});
