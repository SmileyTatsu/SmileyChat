import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isRequestFromTrustedProxy, resolveClientIp } from "./pipeline";

const originalTrustedProxies = process.env.SMILEYCHAT_TRUSTED_PROXIES;

describe("security pipeline client IP resolution", () => {
    beforeEach(() => {
        delete process.env.SMILEYCHAT_TRUSTED_PROXIES;
    });

    afterEach(() => {
        restoreEnv("SMILEYCHAT_TRUSTED_PROXIES", originalTrustedProxies);
    });

    test("ignores x-forwarded-for from untrusted direct clients", () => {
        const request = new Request("http://localhost:4173/api/chats", {
            headers: { "x-forwarded-for": "127.0.0.1" },
        });

        expect(resolveClientIp(request, serverWithIp("203.0.113.10"))).toBe(
            "203.0.113.10",
        );
    });

    test("does not use x-forwarded-for when the socket IP is unavailable", () => {
        const request = new Request("http://localhost:4173/api/chats", {
            headers: { "x-forwarded-for": "127.0.0.1" },
        });

        expect(resolveClientIp(request, serverWithIp(null))).toBe("0.0.0.0");
    });

    test("uses x-forwarded-for from configured trusted proxies", () => {
        process.env.SMILEYCHAT_TRUSTED_PROXIES = "10.0.0.0/8";
        const request = new Request("http://localhost:4173/api/chats", {
            headers: { "x-forwarded-for": "198.51.100.25, 10.0.0.8" },
        });

        expect(resolveClientIp(request, serverWithIp("10.0.0.8"))).toBe("198.51.100.25");
        expect(isRequestFromTrustedProxy(request, serverWithIp("10.0.0.8"))).toBe(true);
    });

    test("does not mark direct clients as trusted proxies", () => {
        process.env.SMILEYCHAT_TRUSTED_PROXIES = "10.0.0.0/8";
        const request = new Request("http://localhost:4173/api/chats");

        expect(isRequestFromTrustedProxy(request, serverWithIp("203.0.113.10"))).toBe(
            false,
        );
    });

    test("falls back to the trusted proxy IP for malformed x-forwarded-for", () => {
        process.env.SMILEYCHAT_TRUSTED_PROXIES = "10.0.0.0/8";
        const request = new Request("http://localhost:4173/api/chats", {
            headers: { "x-forwarded-for": "not-an-ip" },
        });

        expect(resolveClientIp(request, serverWithIp("10.0.0.8"))).toBe("10.0.0.8");
    });
});

function serverWithIp(address: string | null): Bun.Server<unknown> {
    return {
        requestIP() {
            return address ? { address, port: 12345, family: "IPv4" } : null;
        },
    } as unknown as Bun.Server<unknown>;
}

function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[key];
        return;
    }

    process.env[key] = value;
}
