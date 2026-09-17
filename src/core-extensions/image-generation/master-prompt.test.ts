import { describe, expect, test } from "bun:test";

import { compileMasterPrompt, splitMasterPrompt } from "./master-prompt";

describe("image generation master prompt", () => {
    test("preserves every byte outside the macro", () => {
        const template = "  fixed,.,\r\n-2::tag::,\n{{prompt}},\r\nmasterpiece  ";
        const insertion = "1girl, looking at viewer";

        expect(compileMasterPrompt(template, insertion)).toBe(
            "  fixed,.,\r\n-2::tag::,\n1girl, looking at viewer,\r\nmasterpiece  ",
        );
    });

    test("requires exactly one prompt macro", () => {
        expect(() => splitMasterPrompt("no macro")).toThrow("must contain {{prompt}}");
        expect(() => splitMasterPrompt("{{prompt}} + {{prompt}}")).toThrow(
            "exactly once",
        );
    });
});
