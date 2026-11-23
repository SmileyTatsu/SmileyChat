import { afterEach, describe, expect, test } from "bun:test";

import {
    getPluginArtifactAllowedHostnames,
    getPluginRegistryAllowedHostnames,
    isDockerBypassEnabled,
    isTailscaleBypassEnabled,
    shouldOpenBrowser,
} from "./runtime-config";

const keys = [
    "SMILEYCHAT_BYPASS_AUTH_TAILSCALE",
    "SMILEYCHAT_BYPASS_AUTH_DOCKER",
    "SMILEYCHAT_OPEN_BROWSER",
    "SMILEYCHAT_PLUGIN_REGISTRY_URL",
    "SMILEYCHAT_PLUGIN_REGISTRY_ALLOWED_HOSTS",
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

test("registry artifacts may come from GitHub Releases without widening registry fetches", () => {
    for (const key of keys) delete process.env[key];

    expect(getPluginRegistryAllowedHostnames()).toEqual(["raw.githubusercontent.com"]);
    expect(getPluginArtifactAllowedHostnames()).toEqual(
        expect.arrayContaining([
            "raw.githubusercontent.com",
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
        ]),
    );
});

test("artifact hosts keep a custom registry host and extra allowed hosts", () => {
    for (const key of keys) delete process.env[key];
    process.env.SMILEYCHAT_PLUGIN_REGISTRY_URL =
        "https://plugins.example.com/registry.json";
    process.env.SMILEYCHAT_PLUGIN_REGISTRY_ALLOWED_HOSTS = "Cdn.Example.com";

    const hosts = getPluginArtifactAllowedHostnames();

    expect(hosts).toEqual(
        expect.arrayContaining(["plugins.example.com", "cdn.example.com", "github.com"]),
    );
    expect(new Set(hosts).size).toBe(hosts.length);
});
