import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCsrfToken, verifyCsrfRequest } from "./csrf";

const csrfSecret =
    "test-csrf-secret-that-is-long-enough-for-smileychat";
const originalSecret = process.env.SMILEYCHAT_CSRF_SECRET;
const originalTrustedOrigins = process.env.SMILEYCHAT_TRUSTED_ORIGINS;

describe("CSRF request verification", () => {
    beforeEach(() => {
        process.env.SMILEYCHAT_CSRF_SECRET = csrfSecret;
        delete process.env.SMILEYCHAT_TRUSTED_ORIGINS;
    });

    afterEach(() => {
        restoreEnv("SMILEYCHAT_CSRF_SECRET", originalSecret);
        restoreEnv("SMILEYCHAT_TRUSTED_ORIGINS", originalTrustedOrigins);
    });

    test("allows safe methods without provenance or token headers", async () => {
        await expect(
            verifyCsrfRequest(new Request("http://localhost:4173/api/chats")),
        ).resolves.toBeUndefined();
    });

    test("rejects unsafe requests without a CSRF token", async () => {
        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "POST",
                    headers: {
                        Origin: "http://localhost:4173",
                    },
                }),
            ),
        ).rejects.toMatchObject({
            code: "csrf_token_invalid",
            status: 403,
        });
    });

    test("rejects unsafe requests with a forged CSRF token", async () => {
        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "POST",
                    headers: {
                        Origin: "http://localhost:4173",
                        "x-smileychat-csrf": "not-a-real-token",
                    },
                }),
            ),
        ).rejects.toMatchObject({
            code: "csrf_token_invalid",
            status: 403,
        });
    });

    test("rejects untrusted origins even when the CSRF token is valid", async () => {
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "POST",
                    headers: {
                        Origin: "https://evil.example",
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).rejects.toMatchObject({
            code: "csrf_origin_untrusted",
            status: 403,
        });
    });

    test("allows configured trusted origins", async () => {
        process.env.SMILEYCHAT_TRUSTED_ORIGINS = "https://chat.example.com";
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "PUT",
                    headers: {
                        Origin: "https://chat.example.com",
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).resolves.toBeUndefined();
    });

    test("uses proxy headers as an allowed origin", async () => {
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "PUT",
                    headers: {
                        Host: "localhost:4173",
                        Origin: "https://chat.example.com",
                        "x-forwarded-host": "chat.example.com",
                        "x-forwarded-proto": "https",
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).resolves.toBeUndefined();
    });

    test("uses Referer when Origin is unavailable", async () => {
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "DELETE",
                    headers: {
                        Referer: "http://localhost:4173/chats/demo",
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).resolves.toBeUndefined();
    });

    test("rejects unsafe requests without Origin or Referer", async () => {
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request("http://localhost:4173/api/chats", {
                    method: "DELETE",
                    headers: {
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).rejects.toMatchObject({
            code: "csrf_origin_missing",
            status: 403,
        });
    });
});

function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[key];
        return;
    }

    process.env[key] = value;
}
