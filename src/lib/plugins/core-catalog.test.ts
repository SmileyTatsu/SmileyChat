import { describe, expect, test } from "bun:test";

import { corePlugins } from "#frontend/core-extensions";
import { lorebooksManifest } from "#frontend/core-extensions/lorebooks/manifest";
import { mcpManifest } from "#frontend/core-extensions/mcp/manifest";
import { regexReplacerManifest } from "#frontend/core-extensions/regex-replacer/manifest";
import { smileyChatFormatterManifest } from "#frontend/core-extensions/smiley-chat-formatter/manifest";

import {
    CORE_PLUGIN_CATALOG,
    CORE_PLUGIN_IDS,
    GRANTABLE_PLUGIN_PERMISSIONS,
    isGrantablePluginPermission,
} from "./core-catalog";
import {
    GRANTABLE_PLUGIN_PERMISSIONS as GRANTABLE_PLUGIN_PERMISSIONS_FROM_GRANTS,
    isGrantablePluginPermission as isGrantablePluginPermissionFromGrants,
} from "./grants";
import type { PluginManifest } from "./types";

const bundledManifests: PluginManifest[] = [
    smileyChatFormatterManifest,
    lorebooksManifest,
    regexReplacerManifest,
    mcpManifest,
];

describe("core plugin catalog", () => {
    test("lists exactly the extensions the app registers", () => {
        expect([...CORE_PLUGIN_IDS].sort()).toEqual(
            corePlugins.map((plugin) => plugin.manifest.id).sort(),
        );
        expect(CORE_PLUGIN_IDS.size).toBe(CORE_PLUGIN_CATALOG.length);
    });

    test("covers every bundled manifest used by this test", () => {
        expect(bundledManifests.map((manifest) => manifest.id).sort()).toEqual(
            [...CORE_PLUGIN_IDS].sort(),
        );
    });

    test.each(CORE_PLUGIN_CATALOG.map((entry) => [entry.id, entry] as const))(
        "%s matches its bundled manifest",
        (id, entry) => {
            const manifest = bundledManifests.find((candidate) => candidate.id === id);

            expect(manifest).toBeDefined();
            expect(entry.name).toBe(manifest!.name);
            expect(manifest!.category).toBe(entry.category);
            expect(entry.defaultEnabled).toBe(
                manifest!.defaultEnabled ?? manifest!.enabled !== false,
            );
        },
    );
});

describe("grantable plugin permissions", () => {
    test("lists the permissions that need a separate user approval", () => {
        expect(GRANTABLE_PLUGIN_PERMISSIONS).toContain("connections:secrets");
        expect(GRANTABLE_PLUGIN_PERMISSIONS).toContain("server:process");
    });

    test("has no duplicates", () => {
        expect(new Set(GRANTABLE_PLUGIN_PERMISSIONS).size).toBe(
            GRANTABLE_PLUGIN_PERMISSIONS.length,
        );
    });

    test("the guard accepts every listed permission and rejects anything else", () => {
        for (const permission of GRANTABLE_PLUGIN_PERMISSIONS) {
            expect(isGrantablePluginPermission(permission)).toBe(true);
        }

        expect(isGrantablePluginPermission("server")).toBe(false);
        expect(isGrantablePluginPermission("connections")).toBe(false);
        expect(isGrantablePluginPermission("ui:styles")).toBe(false);
        expect(isGrantablePluginPermission("server:process:extra")).toBe(false);
        expect(isGrantablePluginPermission("")).toBe(false);
    });

    test("grants.ts re-exports the same list instead of keeping a copy", () => {
        expect(GRANTABLE_PLUGIN_PERMISSIONS_FROM_GRANTS).toBe(
            GRANTABLE_PLUGIN_PERMISSIONS,
        );

        for (const permission of GRANTABLE_PLUGIN_PERMISSIONS) {
            expect(isGrantablePluginPermissionFromGrants(permission)).toBe(true);
        }

        expect(isGrantablePluginPermissionFromGrants("ui:styles")).toBe(false);
    });
});
