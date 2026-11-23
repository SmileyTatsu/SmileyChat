import { describe, expect, test } from "bun:test";

import { chatSummarizerManifest } from "#frontend/core-extensions/chat-summarizer/manifest";
import { corePlugins } from "#frontend/core-extensions";
import { imageGenerationManifest } from "#frontend/core-extensions/image-generation/manifest";
import { lorebooksManifest } from "#frontend/core-extensions/lorebooks/manifest";
import { mcpManifest } from "#frontend/core-extensions/mcp/manifest";
import { postProcessingManifest } from "#frontend/core-extensions/post-processing/manifest";
import { regexReplacerManifest } from "#frontend/core-extensions/regex-replacer/manifest";
import { smileyChatFormatterManifest } from "#frontend/core-extensions/smiley-chat-formatter/manifest";
import { workspaceToolsManifest } from "#frontend/core-extensions/workspace-tools/manifest";

import { CORE_PLUGIN_CATALOG, CORE_PLUGIN_IDS } from "./core-catalog";
import type { PluginManifest } from "./types";

const bundledManifests: PluginManifest[] = [
    smileyChatFormatterManifest,
    lorebooksManifest,
    chatSummarizerManifest,
    postProcessingManifest,
    regexReplacerManifest,
    mcpManifest,
    workspaceToolsManifest,
    imageGenerationManifest,
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
