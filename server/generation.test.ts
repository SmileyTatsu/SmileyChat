import { expect, test } from "bun:test";

import { publicGenerationResult } from "./generation";

test("does not expose provider raw responses through the generation API", () => {
    const result = publicGenerationResult({
        message: "Hello",
        provider: "openai-compatible",
        raw: { apiKey: "never expose this" },
    });

    expect(result).toEqual({
        message: "Hello",
        provider: "openai-compatible",
    });
});
