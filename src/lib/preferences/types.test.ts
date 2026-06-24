import { describe, expect, test } from "bun:test";

import { defaultAppPreferences, normalizeAppPreferences } from "./types";

describe("app preference normalization", () => {
    test("adds defaults for new appearance preferences", () => {
        const preferences = normalizeAppPreferences({ appearance: {} });

        expect(preferences.appearance.timeFormat).toBe("12h");
        expect(preferences.appearance.customCss).toBe("");
    });

    test("preserves valid time and custom CSS preferences", () => {
        const preferences = normalizeAppPreferences({
            appearance: {
                timeFormat: "24h",
                customCss: ".message { max-width: 70ch; }",
            },
        });

        expect(preferences.appearance.timeFormat).toBe("24h");
        expect(preferences.appearance.customCss).toBe(".message { max-width: 70ch; }");
    });

    test("rejects invalid hour formats", () => {
        const preferences = normalizeAppPreferences({
            appearance: { timeFormat: "locale" },
        });

        expect(preferences.appearance.timeFormat).toBe(
            defaultAppPreferences.appearance.timeFormat,
        );
    });
});
