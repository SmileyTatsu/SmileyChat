import { describe, expect, test } from "bun:test";

import { shouldAlertGenerationComplete, summarizeReply } from "./generation-alert";

const off = { desktop: false, sound: false, onlyWhenUnfocused: true };

describe("shouldAlertGenerationComplete", () => {
    test("stays silent when no channel is enabled", () => {
        expect(
            shouldAlertGenerationComplete({
                documentHidden: true,
                preferences: off,
                windowFocused: false,
            }),
        ).toBe(false);
    });

    test("fires while the tab is hidden", () => {
        expect(
            shouldAlertGenerationComplete({
                documentHidden: true,
                preferences: { ...off, sound: true },
                windowFocused: true,
            }),
        ).toBe(true);
    });

    test("fires while the window lost focus", () => {
        expect(
            shouldAlertGenerationComplete({
                documentHidden: false,
                preferences: { ...off, desktop: true },
                windowFocused: false,
            }),
        ).toBe(true);
    });

    test("stays quiet while the app is focused", () => {
        expect(
            shouldAlertGenerationComplete({
                documentHidden: false,
                preferences: { ...off, desktop: true, sound: true },
                windowFocused: true,
            }),
        ).toBe(false);
    });

    test("ignores focus when the user asked for always", () => {
        expect(
            shouldAlertGenerationComplete({
                documentHidden: false,
                preferences: { ...off, sound: true, onlyWhenUnfocused: false },
                windowFocused: true,
            }),
        ).toBe(true);
    });
});

describe("summarizeReply", () => {
    test("keeps short replies intact", () => {
        expect(summarizeReply("Hello there.")).toBe("Hello there.");
    });

    test("strips multi-bubble tags and collapses whitespace", () => {
        expect(
            summarizeReply('<msg>Hey!</msg>\n\n<msg delay="1s">Did you hear?</msg>'),
        ).toBe("Hey! Did you hear?");
    });

    test("truncates long replies with an ellipsis", () => {
        const summary = summarizeReply("word ".repeat(80), 40);

        expect(summary.length).toBeLessThanOrEqual(40);
        expect(summary.endsWith("…")).toBe(true);
    });
});
