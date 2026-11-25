import { describe, expect, test } from "bun:test";

import { formatContextTokens, formatPricePerMillion } from "./format";

describe("formatContextTokens", () => {
    test("rounds thousands to a compact k label", () => {
        expect(formatContextTokens(128000)).toBe("128k");
        expect(formatContextTokens(131072)).toBe("131k");
        expect(formatContextTokens(32768)).toBe("33k");
    });

    test("uses millions with up to two decimals", () => {
        expect(formatContextTokens(1_000_000)).toBe("1M");
        expect(formatContextTokens(1_048_576)).toBe("1.05M");
        expect(formatContextTokens(2_000_000)).toBe("2M");
    });

    test("keeps small windows as plain token counts", () => {
        expect(formatContextTokens(2048)).toBe("2k");
        expect(formatContextTokens(512)).toBe("512");
    });

    test("returns undefined for missing or invalid limits", () => {
        expect(formatContextTokens(undefined)).toBeUndefined();
        expect(formatContextTokens(null)).toBeUndefined();
        expect(formatContextTokens(0)).toBeUndefined();
        expect(formatContextTokens(Number.NaN)).toBeUndefined();
    });
});

describe("formatPricePerMillion", () => {
    test("formats USD-per-token as USD per million tokens", () => {
        expect(formatPricePerMillion(0.000003)).toBe("$3/M");
        expect(formatPricePerMillion("0.0000005")).toBe("$0.5/M");
        expect(formatPricePerMillion(0.0000125)).toBe("$12.5/M");
    });

    test("labels zero price as free", () => {
        expect(formatPricePerMillion(0)).toBe("free");
        expect(formatPricePerMillion("0")).toBe("free");
    });

    test("returns undefined for missing or unusable prices", () => {
        expect(formatPricePerMillion(undefined)).toBeUndefined();
        expect(formatPricePerMillion(null)).toBeUndefined();
        expect(formatPricePerMillion("")).toBeUndefined();
        expect(formatPricePerMillion("free")).toBeUndefined();
        expect(formatPricePerMillion(-1)).toBeUndefined();
    });

    test("never renders a rounded-to-zero price", () => {
        expect(formatPricePerMillion(0.0000000001)).toBe("<$0.001/M");
    });
});
