import { expect, test } from "bun:test";

import type { Message } from "#frontend/types";

import { estimateMessage, estimateText } from "./token-estimator";

test("estimateText uses a conservative local fallback without a selected profile", () => {
    const samples = ["plain text", "caf\u00e9", "\ud83d\ude00", "a\ud800b", "a\udc00b"];

    for (const value of samples) {
        expect(estimateText(value)).toBeGreaterThanOrEqual(0);
    }
});

test("estimateMessage ignores reasoning that is never sent back to the provider", () => {
    // No adapter replays historical reasoning, so a model that thinks a lot
    // would otherwise trim history that comfortably fits the real request.
    const withReasoning = message("m1", "thinking ".repeat(400));
    const withoutReasoning = message("m1", "");

    expect(estimateMessage(withReasoning)).toBe(estimateMessage(withoutReasoning));
    expect(estimateMessage(withReasoning)).toBeGreaterThan(0);
});

function message(id: string, reasoning: string): Message {
    return {
        id,
        author: "Luna",
        role: "character",
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${id}-swipe`,
                content: "A short reply.",
                createdAt: "2026-01-01T00:00:00.000Z",
                reasoning,
            },
        ],
    };
}
