import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { requirePrivilegedAccess } from "./privileged-gate";

const environmentKeys = [
    "SMILEYCHAT_ADMIN_SECRET",
    "SMILEYCHAT_REQUIRE_ADMIN_SECRET_ON_LOOPBACK",
    "SMILEYCHAT_BASIC_AUTH_USER",
    "SMILEYCHAT_BASIC_AUTH_PASS",
    "SMILEYCHAT_IP_ALLOWLIST",
    "SMILEYCHAT_BYPASS_AUTH_TAILSCALE",
    "SMILEYCHAT_BYPASS_AUTH_DOCKER",
] as const;
const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
);

describe("privileged access gate", () => {
    beforeEach(() => {
        for (const key of environmentKeys) delete process.env[key];
    });

    afterEach(() => {
        for (const key of environmentKeys) {
            const value = originalEnvironment[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    test("allows loopback by default", () => {
        expect(
            requirePrivilegedAccess(
                new Request("http://localhost/api/connections/secrets"),
                "127.0.0.1",
            ),
        ).toBeNull();
    });

    test("requires an admin secret for authenticated remote callers", async () => {
        process.env.SMILEYCHAT_BASIC_AUTH_USER = "admin";
        process.env.SMILEYCHAT_BASIC_AUTH_PASS = "password";
        process.env.SMILEYCHAT_ADMIN_SECRET = "admin-secret";
        const authorization = `Basic ${Buffer.from("admin:password").toString("base64")}`;

        const missing = requirePrivilegedAccess(
            new Request("http://localhost/api/connections/secrets", {
                headers: { authorization },
            }),
            "192.168.1.10",
        );
        expect(missing?.status).toBe(403);
        expect(await missing?.json()).toMatchObject({
            code: "admin_secret_invalid",
        });

        expect(
            requirePrivilegedAccess(
                new Request("http://localhost/api/connections/secrets", {
                    headers: {
                        authorization,
                        "x-smileychat-admin-secret": "admin-secret",
                    },
                }),
                "192.168.1.10",
            ),
        ).toBeNull();
    });
});
