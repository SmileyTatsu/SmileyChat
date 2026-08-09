import { describe, expect, test } from "bun:test";

import { detectTokenizerAlgorithm } from "./auto-detect";
import {
    estimateTextForContext,
    preloadTokenizer,
    resolvedTokenizerAlgorithm,
} from "./registry";
import type { TokenCountContext } from "./types";

const openAIContext: TokenCountContext = {
    provider: "openai-compatible",
    modelId: "gpt-4o-mini",
    selection: { mode: "auto" },
};

describe("local tokenizer registry", () => {
    test("uses provider-aware auto detection without broad DeepSeek matching", () => {
        expect(detectTokenizerAlgorithm("openai-compatible", "gpt-4o-mini")).toBe(
            "o200k_base",
        );
        expect(detectTokenizerAlgorithm("openrouter", "deepseek/deepseek-r1")).toBe(
            "deepseek",
        );
        expect(detectTokenizerAlgorithm("anthropic", "claude-sonnet-4-6")).toBe(
            "heuristic",
        );
    });

    test("loads an OpenAI encoder locally and returns exact text counts", async () => {
        await preloadTokenizer(openAIContext);
        const result = estimateTextForContext("hello world", openAIContext);

        expect(result).toMatchObject({ algorithm: "o200k_base", exact: true });
        expect(result.tokens).toBe(2);
    });

    test("honors a per-profile manual override", () => {
        expect(
            resolvedTokenizerAlgorithm({
                ...openAIContext,
                selection: { mode: "manual", algorithm: "cl100k_base" },
            }),
        ).toBe("cl100k_base");
    });

    test("keeps an intentionally conservative local fallback", () => {
        const result = estimateTextForContext("你好，world!", {
            provider: "anthropic",
            modelId: "claude-sonnet-4-6",
            selection: { mode: "auto" },
        });

        expect(result.exact).toBe(false);
        expect(result.tokens).toBeGreaterThan(0);
    });
});
