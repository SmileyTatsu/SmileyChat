import { describe, expect, test } from "bun:test";

import {
    applyPromptInjectionsWithMetadata,
    type AnchoredPromptMessage,
} from "./injections";
import type { PromptInjection } from "./types";

describe("applyPromptInjectionsWithMetadata", () => {
    test("places at-depth 0 after the latest history message", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(baseMessages(), [
                    injection("depth", "at-depth", { depth: 0 }),
                ]),
            ),
        ).toEqual(["character", "first", "second", "depth", "after-history"]);
    });

    test("places at-depth values relative to messages from the end", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(baseMessages(), [
                    injection("depth-one", "at-depth", { depth: 1 }),
                    injection("depth-two", "at-depth", { depth: 2 }),
                ]),
            ),
        ).toEqual([
            "character",
            "depth-two",
            "first",
            "depth-one",
            "second",
            "after-history",
        ]);
    });

    test("clamps large at-depth values to the first history message", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(baseMessages(), [
                    injection("deep", "at-depth", { depth: 99 }),
                ]),
            ),
        ).toEqual(["character", "deep", "first", "second", "after-history"]);
    });

    test("places at-depth injections at the end when no history exists", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(
                    [presetMessage("character", "after-character")],
                    [injection("depth", "at-depth", { depth: 0 })],
                ),
            ),
        ).toEqual(["character", "depth"]);
    });

    test("preserves before-history and after-history fallback without history", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(
                    [presetMessage("character", "after-character")],
                    [
                        injection("before", "before-history", { order: 0 }),
                        injection("after", "after-history", { order: 1 }),
                    ],
                ),
            ),
        ).toEqual(["character", "before", "after"]);
    });

    test("targets examples anchors when an examples prompt exists", () => {
        expect(
            contents(
                applyPromptInjectionsWithMetadata(
                    [
                        presetMessage("character", "after-character"),
                        presetMessage("examples", "after-examples"),
                        presetMessage("scenario", "after-scenario"),
                    ],
                    [
                        injection("before-examples", "before-examples"),
                        injection("after-examples", "after-examples"),
                    ],
                ),
            ),
        ).toEqual([
            "character",
            "before-examples",
            "examples",
            "after-examples",
            "scenario",
        ]);
    });
});

function baseMessages(): AnchoredPromptMessage[] {
    return [
        presetMessage("character", "after-character"),
        historyMessage("first"),
        historyMessage("second"),
        presetMessage("after-history", "after-history"),
    ];
}

function presetMessage(
    content: string,
    anchor: AnchoredPromptMessage["anchor"],
): AnchoredPromptMessage {
    return {
        anchor,
        message: { role: "system", content },
        source: "preset",
    };
}

function historyMessage(content: string): AnchoredPromptMessage {
    return {
        message: { role: "user", content },
        messageId: content,
        source: "history",
    };
}

function injection(
    id: string,
    anchor: PromptInjection["anchor"],
    patch: Partial<PromptInjection> = {},
): PromptInjection {
    return {
        id,
        anchor,
        content: id,
        order: 0,
        role: "system",
        source: "lorebook",
        ...patch,
    };
}

function contents(messages: AnchoredPromptMessage[]) {
    return messages.map((item) =>
        typeof item.message.content === "string" ? item.message.content : "",
    );
}
