import { describe, expect, test } from "bun:test";

import type { PluginManifest } from "./types";
import { collectAvailablePluginUpdates, findAvailablePluginUpdate } from "./updates";

const registry = [
    { id: "example-plugin", version: "1.2.0" },
    { id: "same-version", version: "1.0.0" },
];

function plugin(patch: Partial<PluginManifest> = {}): PluginManifest {
    return {
        id: "example-plugin",
        name: "Example Plugin",
        version: "1.0.0",
        main: "dist/index.js",
        source: "user",
        install: {
            source: "registry",
            pluginId: "example-plugin",
            artifactUrl: "https://example.com/example-plugin.zip",
            installedAt: "2026-11-23T00:00:00.000Z",
        },
        ...patch,
    };
}

describe("findAvailablePluginUpdate", () => {
    test("returns the registry version only when it is newer", () => {
        expect(findAvailablePluginUpdate(plugin(), registry)).toBe("1.2.0");
        expect(
            findAvailablePluginUpdate(plugin({ version: "1.2.0" }), registry),
        ).toBeUndefined();
        expect(
            findAvailablePluginUpdate(plugin({ version: "1.3.0" }), registry),
        ).toBeUndefined();
    });

    test("ignores core, manual-artifact, and local folder plugins", () => {
        expect(
            findAvailablePluginUpdate(plugin({ source: "core" }), registry),
        ).toBeUndefined();
        expect(
            findAvailablePluginUpdate(
                plugin({
                    install: {
                        source: "manual-artifact",
                        artifactUrl: "https://example.com/example-plugin.zip",
                        installedAt: "2026-11-23T00:00:00.000Z",
                        unverified: true,
                    },
                }),
                registry,
            ),
        ).toBeUndefined();
        expect(
            findAvailablePluginUpdate(plugin({ install: undefined }), registry),
        ).toBeUndefined();
    });

    test("ignores plugins missing from the registry", () => {
        expect(
            findAvailablePluginUpdate(plugin({ id: "unknown-plugin" }), registry),
        ).toBeUndefined();
    });
});

describe("collectAvailablePluginUpdates", () => {
    test("maps each plugin with a pending update to its registry version", () => {
        const updates = collectAvailablePluginUpdates(
            [
                plugin(),
                plugin({ id: "same-version", version: "1.0.0" }),
                plugin({ id: "local-folder", install: undefined }),
            ],
            registry,
        );

        expect([...updates]).toEqual([["example-plugin", "1.2.0"]]);
    });
});
