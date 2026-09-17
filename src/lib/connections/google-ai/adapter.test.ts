import { afterEach, describe, expect, test } from "bun:test";
import {
    createGoogleAIConnection,
    createGoogleAIGenerateUrl,
    googleAIUploadBaseUrl,
} from "./adapter";
import { normalizeGoogleAIBaseUrl } from "./config";
import { listGoogleAIModels } from "./models";

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
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse",
        );
    });

    test("sends API keys in the Google header rather than request URLs", async () => {
        let calledUrl = "";
        let headers: Headers | undefined;
        globalThis.fetch = (async (url, init) => {
            calledUrl = String(url);
            headers = new Headers(init?.headers);
            return new Response(
                JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "Hi" }] } }],
                }),
                {
                    status: 200,
                },
            );
        }) as typeof fetch;

        await createGoogleAIConnection({
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            apiKey: "my-key",
            model: { source: "default", id: "gemini-test" },
        }).generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
        });

        expect(calledUrl).not.toContain("my-key");
        expect(headers?.get("x-goog-api-key")).toBe("my-key");
    });

    test("authenticates model listing with a trimmed header and no query key", async () => {
        globalThis.fetch = (async (url, init) => {
            expect(String(url)).toBe(
                "https://generativelanguage.googleapis.com/v1beta/models",
            );
            expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("my-key");
            return Response.json({
                models: [
                    {
                        name: "models/test",
                        supportedGenerationMethods: ["generateContent"],
                    },
                ],
            });
        }) as typeof fetch;
        expect(
            await listGoogleAIModels({
                baseUrl: "https://generativelanguage.googleapis.com",
                apiKey: " my-key ",
            }),
        ).toHaveLength(1);
    });

    test("authenticates file start, polling, generation, and cleanup without query keys", async () => {
        const calls: string[] = [];
        const uploadUrl = "https://generativelanguage.googleapis.com/upload-session";
        const file = {
            name: "files/test",
            uri: "https://example.com/file",
            mimeType: "text/plain",
        };
        globalThis.fetch = (async (url, init) => {
            const target = String(url);
            calls.push(`${init?.method ?? "GET"} ${target}`);
            expect(new URL(target).searchParams.has("key")).toBe(false);
            if (target === uploadUrl) {
                // The resumable session URL supplies its own upload authorization.
                return Response.json({ file: { ...file, state: "PROCESSING" } });
            }
            expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("my-key");
            if (target.endsWith("/upload/v1beta/files")) {
                return new Response(null, {
                    headers: { "x-goog-upload-url": uploadUrl },
                });
            }
            if (init?.method === "DELETE") return new Response(null, { status: 204 });
            if (target.endsWith("/files/test"))
                return Response.json({ ...file, state: "ACTIVE" });
            return Response.json({
                candidates: [{ content: { parts: [{ text: "Hi" }] } }],
            });
        }) as typeof fetch;
        await createGoogleAIConnection({
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
            apiKey: "my-key",
            model: { source: "default", id: "gemini-test" },
        }).generate({
            messages: [],
            promptMessages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "file",
                            file: {
                                filename: "notes.txt",
                                file_data: "data:text/plain;base64,SGk=",
                                mime_type: "text/plain",
                            },
                        },
                    ],
                },
            ],
        });
        expect(calls).toHaveLength(5);
        expect(calls[2]).toBe(
            "GET https://generativelanguage.googleapis.com/v1beta/files/test",
        );
        expect(calls[4]).toBe(
            "DELETE https://generativelanguage.googleapis.com/v1beta/files/test",
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
