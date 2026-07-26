import { expect, test } from "bun:test";

import { estimateText } from "./token-estimator";

const bytesPerToken = 3.35;

test("estimateText matches TextEncoder byte-length estimates", () => {
    const encoder = new TextEncoder();
    const samples = ["plain text", "caf\u00e9", "\ud83d\ude00", "a\ud800b", "a\udc00b"];

    for (const value of samples) {
        expect(estimateText(value)).toBe(
            Math.ceil(encoder.encode(value).length / bytesPerToken),
        );
    }
});
