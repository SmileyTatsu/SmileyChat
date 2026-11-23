import { describe, expect, test } from "bun:test";

import { normalizeChatCompletionResponse } from "./chat-completions";

const options = {
    emptyMessage: "The provider returned an empty message.",
    provider: "openai-compatible",
    providerErrorPrefix: "Provider error",
};

describe("Chat Completions response normalization", () => {
    test("surfaces a top-level error envelope instead of throwing a TypeError", () => {
        const response = {
            error: { message: "Insufficient credits", type: "insufficient_quota" },
        } as unknown as Parameters<typeof normalizeChatCompletionResponse>[0];

        expect(() => normalizeChatCompletionResponse(response, options)).toThrow(
            "Provider error: Insufficient credits",
        );
    });

    test("reports an empty message when choices are missing", () => {
        const response = {} as unknown as Parameters<
            typeof normalizeChatCompletionResponse
        >[0];

        expect(() => normalizeChatCompletionResponse(response, options)).toThrow(
            options.emptyMessage,
        );
    });
});
