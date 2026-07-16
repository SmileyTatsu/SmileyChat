import { describe, expect, test } from "bun:test";

import type { Message } from "#frontend/types";

import {
    protectedHistoryMessageId,
    selectHistoryMessagesForBudget,
} from "./history-budget";
import { estimateMessage } from "./token-estimator";

describe("selectHistoryMessagesForBudget", () => {
    test("keeps newest messages that fit and always retains the last user turn", () => {
        const messages = [
            message("m1", "user", "old ".repeat(80)),
            message("m2", "character", "mid ".repeat(80)),
            message("m3", "user", "new ".repeat(80)),
            message("m4", "character", "latest ".repeat(80)),
        ];
        const selected = selectHistoryMessagesForBudget({
            messages,
            availableHistoryTokens: estimateMessage(messages[3]),
        });

        // m3 is the protected last user turn even if the budget is tight.
        expect(selected.map((item) => item.id)).toEqual(["m3", "m4"]);
        expect(selected.some((item) => item.id === "m1")).toBe(false);
    });

    test("always keeps the protected latest user turn", () => {
        const messages = [
            message("m1", "user", "old"),
            message("m2", "character", "reply"),
            message("m3", "user", "latest ".repeat(200)),
        ];
        const selected = selectHistoryMessagesForBudget({
            messages,
            availableHistoryTokens: 0,
        });

        expect(selected.map((item) => item.id)).toEqual(["m3"]);
        expect(protectedHistoryMessageId(messages)).toBe("m3");
    });

    test("walks a long history from the end without keeping the head", () => {
        const messages = Array.from({ length: 200 }, (_, index) =>
            message(
                `m${index + 1}`,
                index % 2 === 0 ? "user" : "character",
                `turn ${index + 1} ${"x".repeat(40)}`,
            ),
        );
        const selected = selectHistoryMessagesForBudget({
            messages,
            availableHistoryTokens: 400,
        });

        expect(selected.length).toBeGreaterThan(0);
        expect(selected.length).toBeLessThan(messages.length);
        expect(selected[selected.length - 1]?.id).toBe("m200");
        expect(selected.some((item) => item.id === "m1")).toBe(false);
    });

    test("keeps adjacent tool call and result messages together", () => {
        const messages = [
            message("m1", "user", "please use a tool"),
            {
                ...message("m2", "character", ""),
                toolCalls: [
                    {
                        id: "call-1",
                        name: "lookup",
                        argumentsText: "{}",
                    },
                ],
            },
            {
                ...message("m3", "user", "tool output"),
                toolResult: {
                    toolCallId: "call-1",
                    name: "lookup",
                    content: "result ".repeat(40),
                },
            },
            message("m4", "character", "done"),
        ];
        const selected = selectHistoryMessagesForBudget({
            messages,
            availableHistoryTokens:
                estimateMessage(messages[1]) +
                estimateMessage(messages[2]) +
                estimateMessage(messages[3]),
        });

        expect(selected.map((item) => item.id)).toEqual(["m2", "m3", "m4"]);
    });

    test("skips messages excluded from the prompt", () => {
        const messages = [
            message("m1", "user", "visible old"),
            {
                ...message("m2", "character", "hidden"),
                metadata: {
                    includeInPrompt: false,
                    promptRole: "none" as const,
                },
            },
            message("m3", "user", "latest"),
        ];
        const selected = selectHistoryMessagesForBudget({
            messages,
            availableHistoryTokens: 10_000,
        });

        expect(selected.map((item) => item.id)).toEqual(["m1", "m3"]);
    });
});

function message(id: string, role: Message["role"], content: string): Message {
    return {
        id,
        author: role === "user" ? "Anon" : "Luna",
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${id}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
