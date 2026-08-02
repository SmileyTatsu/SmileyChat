import { describe, expect, test } from "bun:test";

import { formatDuration } from "./time";

describe("formatDuration", () => {
    test("formats sub-second durations in milliseconds", () => {
        expect(formatDuration(250)).toBe("250ms");
    });

    test("formats second durations with useful precision", () => {
        expect(formatDuration(1_000)).toBe("1s");
        expect(formatDuration(1_400)).toBe("1.4s");
        expect(formatDuration(14_000)).toBe("14s");
    });

    test("formats minute durations with padded seconds", () => {
        expect(formatDuration(60_000)).toBe("1m 00s");
        expect(formatDuration(125_999)).toBe("2m 05s");
    });
});
