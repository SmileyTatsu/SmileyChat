import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCsrfToken, verifyCsrfRequest } from "./csrf";

const csrfSecret = "test-csrf-secret-that-is-long-enough-for-smileychat";
const originalSecret = process.env.SMILEYCHAT_CSRF_SECRET;
const originalTrustedOrigins = process.env.SMILEYCHAT_TRUSTED_ORIGINS;

const FRONTEND_PORT = process.env.SMILEYCHAT_FRONTEND_PORT ?? "5173";
const API_PORT = process.env.SMILEYCHAT_API_PORT ?? "4173";

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
            verifyCsrfRequest(new Request(`http://localhost:${API_PORT}/api/chats`)),
        ).resolves.toBeUndefined();
    });

    test("rejects unsafe requests without a CSRF token", async () => {
        await expect(
            verifyCsrfRequest(
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "POST",
                    headers: { Origin: `http://localhost:${API_PORT}` },
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "POST",
                    headers: {
                        Origin: `http://localhost:${API_PORT}`,
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "PUT",
                    headers: {
                        Origin: "https://chat.example.com",
                        "x-smileychat-csrf": token,
                    },
                }),
            ),
        ).resolves.toBeUndefined();
    });

    test("allows default loopback frontend origins", async () => {
        const token = await createCsrfToken();

        for (const origin of [
            `http://localhost:${FRONTEND_PORT}`,
            `http://127.0.0.1:${FRONTEND_PORT}`,
            `http://[::1]:${FRONTEND_PORT}`,
        ]) {
            await expect(
                verifyCsrfRequest(
                    new Request(`http://localhost:${API_PORT}/api/chats`, {
                        method: "PUT",
                        headers: {
                            Origin: origin,
                            "x-smileychat-csrf": token,
                        },
                    }),
                ),
            ).resolves.toBeUndefined();
        }
    });

    test("treats blank trusted origins as unset", async () => {
        process.env.SMILEYCHAT_TRUSTED_ORIGINS = "";
        const token = await createCsrfToken();

        await expect(
            verifyCsrfRequest(
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "PUT",
                    headers: {
                        Origin: `http://localhost:${FRONTEND_PORT}`,
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "PUT",
                    headers: {
                        Host: `localhost:${API_PORT}`,
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
                    method: "DELETE",
                    headers: {
                        Referer: `http://localhost:${API_PORT}/chats/demo`,
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
                new Request(`http://localhost:${API_PORT}/api/chats`, {
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
