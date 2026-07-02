import { afterEach, describe, expect, test } from "bun:test";

import {
    assertLocalPluginAssetUrl,
    isLocalPluginAssetUrl,
    pluginStylesheetSelector,
} from "./runtime";

const originalCss = globalThis.CSS;

afterEach(() => {
    globalThis.CSS = originalCss;
});

describe("plugin runtime loading helpers", () => {
    test("accepts only same-origin plugin asset URLs", () => {
        const base = "http://127.0.0.1:4173/app/";

        expect(isLocalPluginAssetUrl("/plugins/example/dist/index.js?v=1", base)).toBe(
            true,
        );
        expect(
            isLocalPluginAssetUrl(
                "http://127.0.0.1:4173/plugins/example/dist/index.js",
                base,
            ),
        ).toBe(true);
        expect(
            isLocalPluginAssetUrl("https://example.com/plugins/example/index.js", base),
        ).toBe(false);
        expect(
            isLocalPluginAssetUrl("//example.com/plugins/example/index.js", base),
        ).toBe(false);
        expect(isLocalPluginAssetUrl("/api/plugins/example/storage", base)).toBe(false);
    });

    test("throws a clear error for remote plugin asset URLs", () => {
        expect(() =>
            assertLocalPluginAssetUrl("https://example.com/plugin.js", "entry URL"),
        ).toThrow("Plugin entry URL must be a local /plugins/... URL.");
    });

    test("escapes stylesheet selector values", () => {
        globalThis.CSS = {
            escape(value: string) {
                return `escaped(${value})`;
            },
        } as typeof CSS;

        expect(pluginStylesheetSelector('plugin"id', '/plugins/plugin/style".css')).toBe(
            'link[data-plugin-id="escaped(plugin"id)"][href="escaped(/plugins/plugin/style".css)"]',
        );
    });
});
