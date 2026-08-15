import { afterEach, describe, expect, test } from "bun:test";

import {
    isDockerBypassEnabled,
    isTailscaleBypassEnabled,
    shouldOpenBrowser,
} from "./runtime-config";

const keys = [
    "SMILEYCHAT_BYPASS_AUTH_TAILSCALE",
    "SMILEYCHAT_BYPASS_AUTH_DOCKER",
    "SMILEYCHAT_OPEN_BROWSER",
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

test("browser launching is enabled unless explicitly disabled", () => {
    delete process.env.SMILEYCHAT_OPEN_BROWSER;
    expect(shouldOpenBrowser()).toBe(true);

    for (const value of ["false", "0", "no", "off"]) {
        process.env.SMILEYCHAT_OPEN_BROWSER = value;
        expect(shouldOpenBrowser()).toBe(false);
    }

    process.env.SMILEYCHAT_OPEN_BROWSER = "true";
    expect(shouldOpenBrowser()).toBe(true);
});
