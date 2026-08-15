import { describe, expect, test } from "bun:test";

import { formatInterruptedGeneration } from "./use-chat-session";

describe("formatInterruptedGeneration", () => {
    test("keeps received streaming content and appends an interruption notice", () => {
        expect(
            formatInterruptedGeneration(
                "  A partial reply.  ",
                new Error("Connection lost"),
            ),
        ).toBe(
            "A partial reply.\n\n*[Generation interrupted during streaming: Connection lost]*",
        );
    });

    test("reports a generation failure when no streaming content was received", () => {
        expect(formatInterruptedGeneration(" \n\t", new Error("Request timed out"))).toBe(
            "Generation failed: Request timed out",
        );
    });
});
