import { describe, expect, test } from "bun:test";
import { safeResponseText, trimTrailingSlash } from "./http";

describe("connections http helpers", () => {
    test("trimTrailingSlash removes trailing slashes", () => {
        expect(trimTrailingSlash("https://example.com///")).toBe("https://example.com");
        expect(trimTrailingSlash("https://example.com")).toBe("https://example.com");
    });

    test("safeResponseText preserves long error payloads beyond 500 characters", async () => {
        const longPayload = JSON.stringify({
            error: {
                code: 400,
                message: "A".repeat(800),
                details: [{ violation: "B".repeat(500) }],
            },
        });

        const response = new Response(longPayload, { status: 400 });
        const text = await safeResponseText(response);

        expect(text.length).toBeGreaterThan(1000);
        expect(text).toBe(longPayload);
    });

    test("safeResponseText respects custom limit", async () => {
        const payload = "1234567890";
        const response = new Response(payload, { status: 500 });
        const text = await safeResponseText(response, 5);

        expect(text).toBe("12345");
    });

    test("safeResponseText returns empty string if text reading fails", async () => {
        const faultyResponse = {
            text: () => Promise.reject(new Error("Stream error")),
        } as unknown as Response;

        const text = await safeResponseText(faultyResponse);
        expect(text).toBe("");
    });
});
