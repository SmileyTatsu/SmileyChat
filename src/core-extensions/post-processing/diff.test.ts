import { describe, expect, test } from "bun:test";

import { diffSideBySide } from "./diff";

describe("diffSideBySide", () => {
    test("returns matching original and revised rows for unchanged text", () => {
        expect(diffSideBySide("same text", "same text")).toEqual([
            {
                type: "equal",
                original: [{ type: "equal", text: "same text" }],
                revised: [{ type: "equal", text: "same text" }],
            },
        ]);
    });

    test("marks replacements only on the relevant side", () => {
        expect(diffSideBySide("hello old world", "hello new world")).toEqual([
            {
                type: "changed",
                original: [
                    { type: "equal", text: "hello " },
                    { type: "removed", text: "old" },
                    { type: "equal", text: " world" },
                ],
                revised: [
                    { type: "equal", text: "hello " },
                    { type: "added", text: "new" },
                    { type: "equal", text: " world" },
                ],
            },
        ]);
    });

    test("keeps line alignment for added and removed lines", () => {
        expect(diffSideBySide("one\nold\nthree", "one\nnew\nthree")).toEqual([
            {
                type: "equal",
                original: [{ type: "equal", text: "one\n" }],
                revised: [{ type: "equal", text: "one\n" }],
            },
            {
                type: "changed",
                original: [
                    { type: "removed", text: "old" },
                    { type: "equal", text: "\n" },
                ],
                revised: [
                    { type: "added", text: "new" },
                    { type: "equal", text: "\n" },
                ],
            },
            {
                type: "equal",
                original: [{ type: "equal", text: "three" }],
                revised: [{ type: "equal", text: "three" }],
            },
        ]);
    });

    test("does not collapse very large diffs into one full-document change", () => {
        const original = Array.from({ length: 2100 }, (_, index) => `line ${index}`).join(
            "\n",
        );
        const revised = Array.from({ length: 2100 }, (_, index) =>
            index === 1500 ? "line changed" : `line ${index}`,
        ).join("\n");

        const rows = diffSideBySide(original, revised);

        expect(rows).toHaveLength(2100);
        expect(rows.filter((row) => row.type === "changed")).toHaveLength(1);
    });
});
