import { describe, expect, test } from "bun:test";

import { groupOfModelId, highlightRanges, rankModels, tokenizeQuery } from "./search";
import type { ModelPickerItem } from "./types";

function model(id: string, label = id, group = "test"): ModelPickerItem {
    return { id, label, group };
}

const emptyFavorites = new Set<string>();

describe("groupOfModelId", () => {
    test("uses the prefix before a slash", () => {
        expect(groupOfModelId("anthropic/claude-sonnet-4")).toBe("anthropic");
        expect(groupOfModelId("meta-llama/Llama-3-70B")).toBe("meta-llama");
    });

    test("falls back to the first token before - : . _", () => {
        expect(groupOfModelId("gpt-4o-mini")).toBe("gpt");
        expect(groupOfModelId("Qwen3:32b")).toBe("qwen3");
        expect(groupOfModelId("mistral.7b")).toBe("mistral");
        expect(groupOfModelId("llama_3_70b")).toBe("llama");
        expect(groupOfModelId("gpt4")).toBe("gpt4");
    });
});

describe("rankModels", () => {
    test("matches words in any order, over id and label", () => {
        const items = [
            model("anthropic/claude-sonnet-4", "Claude Sonnet 4"),
            model("anthropic/claude-haiku-4", "Claude Haiku 4"),
            model("meta/llama-3-70b", "Llama 3 70B"),
        ];

        const { items: found, loose } = rankModels(
            items,
            "sonnet claude",
            emptyFavorites,
        );

        expect(found.map((entry) => entry.id)).toEqual(["anthropic/claude-sonnet-4"]);
        expect(loose).toBe(false);
    });

    test("searches labels even when the id does not contain the word", () => {
        const items = [model("anthropic/opus-4-6", "Claude Opus 4.6")];

        expect(rankModels(items, "opus", emptyFavorites).items).toHaveLength(1);
        expect(rankModels(items, "claude", emptyFavorites).items).toHaveLength(1);
    });

    test("ranks start-of-field before word boundaries before mid-word hits", () => {
        const items = [
            model("xclaude", "xclaude"),
            model("anthropic/claude-3-opus", "Anthropic Claude 3 Opus"),
            model("claude-3-opus", "claude-3-opus"),
            model("foo-claude", "foo-claude"),
        ];

        expect(
            rankModels(items, "claude", emptyFavorites).items.map((entry) => entry.id),
        ).toEqual(["claude-3-opus", "foo-claude", "anthropic/claude-3-opus", "xclaude"]);
    });

    test("puts favorites first regardless of score", () => {
        const items = [model("claude-3-opus"), model("anthropic/claude-3-opus")];

        const { items: found } = rankModels(
            items,
            "claude",
            new Set(["anthropic/claude-3-opus"]),
        );

        expect(found[0].id).toBe("anthropic/claude-3-opus");
    });

    test("falls back to loose subsequence matches with a flag", () => {
        const items = [model("claude-sonnet-4"), model("gpt-4o")];

        const { items: found, loose } = rankModels(items, "csn4", emptyFavorites);

        expect(loose).toBe(true);
        expect(found.map((entry) => entry.id)).toEqual(["claude-sonnet-4"]);
    });

    test("returns every match without a cap", () => {
        const items = Array.from({ length: 500 }, (_, index) => model(`model-${index}`));

        expect(rankModels(items, "model", emptyFavorites).items).toHaveLength(500);
    });

    test("returns every item when the query is empty", () => {
        const items = [model("a"), model("b")];

        expect(rankModels(items, "   ", emptyFavorites)).toEqual({
            items,
            loose: false,
        });
    });
});

describe("highlightRanges", () => {
    test("returns merged ranges for words in any order", () => {
        expect(highlightRanges("sonnet-4", "4 sonnet net-4")).toEqual([[0, 8]]);
        expect(highlightRanges("claude-sonnet", "claude sonnet")).toEqual([
            [0, 6],
            [7, 13],
        ]);
    });

    test("is case-insensitive and returns nothing when a word is missing", () => {
        expect(highlightRanges("Claude Sonnet", "SONNET")).toEqual([[7, 13]]);
        expect(highlightRanges("claude", "gpt")).toEqual([]);
        expect(highlightRanges("claude", "  ")).toEqual([]);
    });
});

describe("tokenizeQuery", () => {
    test("splits on whitespace and lower-cases", () => {
        expect(tokenizeQuery("  Claude   Sonnet ")).toEqual(["claude", "sonnet"]);
    });
});
