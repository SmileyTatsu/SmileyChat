import { describe, expect, it } from "bun:test";

import { trimGeneratedText } from "./generated-text";

describe("trimGeneratedText", () => {
    it("keeps leading indentation", () => {
        expect(trimGeneratedText("    indented line\n    more")).toBe(
            "    indented line\n    more",
        );
    });

    it("keeps blank lines inside the reply", () => {
        expect(trimGeneratedText("first\n\nsecond")).toBe("first\n\nsecond");
    });

    it("drops trailing whitespace only", () => {
        expect(trimGeneratedText("done\n\n  ")).toBe("done");
    });

    it("leaves a whitespace-only reply empty", () => {
        expect(trimGeneratedText("   \n\n ")).toBe("");
    });
});
