import { afterEach, describe, expect, test } from "bun:test";

import { isDockerBypassEnabled, isTailscaleBypassEnabled } from "./runtime-config";

const keys = [
    "SMILEYCHAT_BYPASS_AUTH_TAILSCALE",
    "SMILEYCHAT_BYPASS_AUTH_DOCKER",
] as const;
const originalEnvironment = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
    for (const key of keys) {
        const value = originalEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

test("Tailscale and Docker auth bypasses require an explicit opt-in", () => {
    for (const key of keys) delete process.env[key];
    expect(isTailscaleBypassEnabled()).toBe(false);
    expect(isDockerBypassEnabled()).toBe(false);

    process.env.SMILEYCHAT_BYPASS_AUTH_TAILSCALE = "true";
    process.env.SMILEYCHAT_BYPASS_AUTH_DOCKER = "1";
    expect(isTailscaleBypassEnabled()).toBe(true);
    expect(isDockerBypassEnabled()).toBe(true);
});
