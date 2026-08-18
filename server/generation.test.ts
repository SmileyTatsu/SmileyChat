import { describe, expect, test } from "bun:test";

import {
    extractFinishReason,
    extractUsageTokens,
    publicGenerationResult,
} from "./generation";

describe("generation", () => {
    test("does not expose provider raw responses through the generation API", () => {
        const result = publicGenerationResult({
            message: "Hello",
            provider: "openai-compatible",
            raw: { apiKey: "never expose this" },
        });

        expect(result).toEqual({
            message: "Hello",
            provider: "openai-compatible",
        });
    });

    test("extracts token counts from OpenAI-style usage objects", () => {
        const usage = {
            prompt_tokens: 120,
            completion_tokens: 45,
            total_tokens: 165,
        };

        expect(extractUsageTokens({ usage })).toEqual({
            promptTokens: 120,
            completionTokens: 45,
            totalTokens: 165,
        });
    });

    test("extracts token counts from Anthropic-style usage objects", () => {
        const usage = {
            input_tokens: 200,
            output_tokens: 80,
        };

        expect(extractUsageTokens({ usage })).toEqual({
            promptTokens: 200,
            completionTokens: 80,
            totalTokens: 280,
        });
    });

    test("extracts token counts from Google AI-style usageMetadata objects", () => {
        const usageMetadata = {
            promptTokenCount: 350,
            candidatesTokenCount: 90,
            totalTokenCount: 440,
        };

        expect(extractUsageTokens({ usageMetadata })).toEqual({
            promptTokens: 350,
            completionTokens: 90,
            totalTokens: 440,
        });
    });

    test("returns empty object when token usage is not reported", () => {
        expect(extractUsageTokens(undefined)).toEqual({});
        expect(extractUsageTokens({})).toEqual({});
        expect(extractUsageTokens({ usage: {} })).toEqual({});
    });

    test("normalizes finish reason across providers", () => {
        expect(extractFinishReason({ finish_reason: "stop" })).toBe("stop");
        expect(extractFinishReason({ finish_reason: "length" })).toBe("length");
        expect(extractFinishReason({ stop_reason: "end_turn" })).toBe("stop");
        expect(extractFinishReason({ stop_reason: "max_tokens" })).toBe("length");
        expect(extractFinishReason({ candidates: [{ finishReason: "STOP" }] })).toBe(
            "stop",
        );
        expect(
            extractFinishReason({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
        ).toBe("length");
        expect(extractFinishReason(undefined)).toBe("stop");
    });
});
