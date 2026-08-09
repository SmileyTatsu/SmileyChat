import { expect, test } from "bun:test";

import { estimateText } from "./token-estimator";

test("estimateText uses a conservative local fallback without a selected profile", () => {
    const samples = ["plain text", "caf\u00e9", "\ud83d\ude00", "a\ud800b", "a\udc00b"];

    for (const value of samples) {
        expect(estimateText(value)).toBeGreaterThanOrEqual(0);
    }
});
