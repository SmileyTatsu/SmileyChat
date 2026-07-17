import { afterEach, describe, expect, test } from "bun:test";

import { applyProfileToPlugins } from "./activation";
import type { PluginManifest } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("plugin profile activation", () => {
    test("does not overwrite plugin storage when a profile has no config snapshot", async () => {
        const requests: string[] = [];
        mockFetch(async (input) => {
            requests.push(String(input));
            return jsonResponse({ ok: true });
        });

        const result = await applyProfileToPlugins(
            {
                builtin: true,
                defaultEnabled: true,
                enabledPlugins: {},
                id: "default",
                name: "Default",
            },
            [pluginManifest("plugin-a"), pluginManifest("plugin-b")],
        );

        expect(result).toEqual({
            appliedEnabled: {
                "plugin-a": true,
                "plugin-b": true,
            },
            configChanges: [],
            enabledChanges: [],
        });
        expect(requests).toEqual([]);
    });

    test("keeps disabled-by-default plugins disabled for the Default profile", async () => {
        const result = await applyProfileToPlugins(
            {
                builtin: true,
                enabledPlugins: {},
                id: "default",
                name: "Default",
            },
            [
                pluginManifest("enabled-plugin", { defaultEnabled: true }),
                pluginManifest("disabled-plugin", {
                    defaultEnabled: false,
                    enabled: false,
                }),
            ],
        );

        expect(result).toEqual({
            appliedEnabled: {
                "enabled-plugin": true,
                "disabled-plugin": false,
            },
            configChanges: [],
            enabledChanges: [],
        });
    });

    test("restores only explicit plugin config snapshots", async () => {
        const requests: Array<{ body?: string; method?: string; url: string }> = [];
        mockFetch(async (input, init) => {
            const url = String(input);
            requests.push({
                body: typeof init?.body === "string" ? init.body : undefined,
                method: init?.method,
                url,
            });

            if (url === "/api/csrf") {
                return jsonResponse({ token: "csrf-token" });
            }

            return jsonResponse({ ok: true });
        });

        const result = await applyProfileToPlugins(
            {
                builtin: false,
                enabledPlugins: {
                    "plugin-a": false,
                    "plugin-b": false,
                },
                id: "profile-a",
                name: "Profile A",
                pluginConfig: {
                    "plugin-a": {
                        settings: {
                            enabled: true,
                        },
                    },
                },
            },
            [
                pluginManifest("plugin-a", { enabled: false }),
                pluginManifest("plugin-b", { enabled: false }),
            ],
        );

        expect(result.configChanges).toEqual(["plugin-a"]);
        expect(result.enabledChanges).toEqual([]);
        expect(requests).toEqual([
            {
                body: undefined,
                method: undefined,
                url: "/api/csrf",
            },
            {
                body: JSON.stringify({
                    storage: {
                        settings: {
                            enabled: true,
                        },
                    },
                }),
                method: "PUT",
                url: "/api/plugins/plugin-a/storage",
            },
        ]);
    });
});

function pluginManifest(id: string, patch: Partial<PluginManifest> = {}): PluginManifest {
    return {
        id,
        main: "dist/index.js",
        name: id,
        version: "1.0.0",
        ...patch,
    };
}

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: {
            "Content-Type": "application/json",
        },
    });
}

function mockFetch(handler: (...args: Parameters<typeof fetch>) => Promise<Response>) {
    globalThis.fetch = Object.assign(handler, {
        preconnect: originalFetch.preconnect.bind(originalFetch),
    }) as typeof fetch;
}
