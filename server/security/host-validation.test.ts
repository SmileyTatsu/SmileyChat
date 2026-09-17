import { describe, expect, test } from "bun:test";
import { hostnameFromAuthority, isAllowedHost } from "./host-validation";

describe("host validation", () => {
    test("allows localhost and loopback IPv4/IPv6", () => {
        expect(isAllowedHost("localhost")).toBe(true);
        expect(isAllowedHost("127.0.0.1")).toBe(true);
        expect(isAllowedHost("::1")).toBe(true);
        expect(isAllowedHost("[::1]")).toBe(true);
    });

    test("allows private network hostnames and IPs", () => {
        expect(isAllowedHost("192.168.1.50")).toBe(true);
        expect(isAllowedHost("10.0.0.2")).toBe(true);
        expect(isAllowedHost("172.16.0.5")).toBe(true);
        expect(isAllowedHost("100.64.0.1")).toBe(true);
    });

    test("rejects arbitrary external hostnames and DNS rebinding hosts", () => {
        expect(isAllowedHost("attacker.example.com")).toBe(false);
        expect(isAllowedHost("evil.com")).toBe(false);
        expect(isAllowedHost("google.com")).toBe(false);
        expect(isAllowedHost("203.0.113.10")).toBe(false);
        expect(isAllowedHost("")).toBe(false);
    });

    test("allows hostname configured via SMILEYCHAT_HOST", () => {
        const original = Bun.env.SMILEYCHAT_HOST;
        try {
            Bun.env.SMILEYCHAT_HOST = "smiley.home";
            expect(isAllowedHost("smiley.home")).toBe(true);
            expect(isAllowedHost("other.home")).toBe(false);
        } finally {
            if (original === undefined) {
                delete Bun.env.SMILEYCHAT_HOST;
            } else {
                Bun.env.SMILEYCHAT_HOST = original;
            }
        }
    });

    test("extracts hostname from host authority with or without port", () => {
        expect(hostnameFromAuthority("localhost:4173")).toBe("localhost");
        expect(hostnameFromAuthority("127.0.0.1:8080")).toBe("127.0.0.1");
        expect(hostnameFromAuthority("[::1]:4173")).toBe("[::1]");
        expect(hostnameFromAuthority("example.com")).toBe("example.com");
        expect(hostnameFromAuthority("")).toBeUndefined();
    });

    test("rejects malformed authorities containing userinfo, paths, queries, fragments, whitespace, or commas", () => {
        expect(hostnameFromAuthority("evil.example@localhost:4173")).toBeUndefined();
        expect(hostnameFromAuthority("user:pass@localhost:4173")).toBeUndefined();
        expect(hostnameFromAuthority("localhost:4173/path")).toBeUndefined();
        expect(hostnameFromAuthority("localhost:4173?query=1")).toBeUndefined();
        expect(hostnameFromAuthority("localhost:4173#hash")).toBeUndefined();
        expect(hostnameFromAuthority("localhost:4173, evil.com")).toBeUndefined();
        expect(hostnameFromAuthority("localhost:4173 evil.com")).toBeUndefined();
        expect(hostnameFromAuthority("localhost\0:4173")).toBeUndefined();
        expect(hostnameFromAuthority("localhost\n:4173")).toBeUndefined();
    });
});
