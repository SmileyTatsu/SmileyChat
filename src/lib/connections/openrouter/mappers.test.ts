import { describe, expect, test } from "bun:test";

import { createOpenRouterChatCompletionBody } from "./mappers";

describe("OpenRouter connection mappers", () => {
    test("adds max_completion_tokens", () => {
        const body = createOpenRouterChatCompletionBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
            },
            {
                maxCompletionTokens: 250,
                model: { source: "api", id: "openai/gpt-5.5" },
                providerPreferences: {},
            },
        );

        expect(body.max_completion_tokens).toBe(250);
        expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });
});
