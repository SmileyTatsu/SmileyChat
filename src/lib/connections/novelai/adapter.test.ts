import { afterEach, describe, expect, test } from "bun:test";

import {
    createNovelAICompletionUrl,
    createNovelAIConnection,
    createNovelAITextGenerationUrl,
} from "./adapter";

const originalFetch = globalThis.fetch;

describe("NovelAI connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("routes default models to the correct endpoints", () => {
        const chatConfig = {
            model: { source: "default" as const, id: "glm-4-6" },
        };
        const textConfig = {
            model: { source: "default" as const, id: "llama-3-erato-v1" },
        };

        expect(createNovelAICompletionUrl(chatConfig)).toBe(
            "https://text.novelai.net/oa/v1/chat/completions",
        );
        expect(createNovelAITextGenerationUrl(textConfig, false)).toBe(
            "https://text.novelai.net/ai/generate",
        );
        expect(createNovelAITextGenerationUrl(textConfig, true)).toBe(
            "https://text.novelai.net/ai/generate-stream",
        );
    });

    test("streams text generation tokens", async () => {
        globalThis.fetch = (async () =>
            new Response(
                ['data: {"token":"Hello"}', "", 'data: {"output":" there"}', ""].join(
                    "\n",
                ),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                    },
                },
            )) as unknown as typeof fetch;

        const adapter = createNovelAIConnection({
            model: { source: "default", id: "kayra-v1" },
        });
        let streamedMessage = "";

        const result = await adapter.generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
            stream: true,
            onToken: (token) => {
                streamedMessage += token;
            },
        });

        expect(streamedMessage).toBe("Hello there");
        expect(result).toMatchObject({
            message: "Hello there",
            provider: "novelai",
            model: "kayra-v1",
        });
    });
});
