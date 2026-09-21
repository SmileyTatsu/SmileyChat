import { describe, expect, test } from "bun:test";

import { formatConnectionError, isLocalEndpoint } from "./connection-error";

describe("connection error diagnostics", () => {
    test("recognizes loopback and private-network endpoints", () => {
        expect(isLocalEndpoint("http://localhost:11434/v1")).toBe(true);
        expect(isLocalEndpoint("http://0.0.0.0:11434/v1")).toBe(true);
        expect(isLocalEndpoint("http://127.0.0.1:1234/v1")).toBe(true);
        expect(isLocalEndpoint("http://192.168.1.20:5001/v1")).toBe(true);
        expect(isLocalEndpoint("http://[::1]:5001/v1")).toBe(true);
    });

    test("does not mistake public lookalike hostnames for local endpoints", () => {
        expect(isLocalEndpoint("https://localhost.example.com/v1")).toBe(false);
        expect(isLocalEndpoint("https://fca.example/v1")).toBe(false);
        expect(isLocalEndpoint("https://api.openai.com/v1")).toBe(false);
        expect(isLocalEndpoint("not a URL")).toBe(false);
    });

    test("adds browser-access guidance only for local network failures", () => {
        expect(
            formatConnectionError(
                new TypeError("Failed to fetch"),
                "http://localhost:11434/v1/models",
            ),
        ).toContain("OLLAMA_ORIGINS");
        expect(
            formatConnectionError(
                new TypeError("Failed to fetch"),
                "https://api.openai.com/v1/models",
            ),
        ).toBe("Failed to fetch");
        expect(
            formatConnectionError(
                new Error("Unauthorized"),
                "http://localhost:11434/v1/models",
            ),
        ).toBe("Unauthorized");
    });
});
