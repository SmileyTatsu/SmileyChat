import { describe, expect, test } from "bun:test";

import { splitMasterPrompt } from "./master-prompt";
import { defaultImageGenerationSettings } from "./settings";
import { areImageSettingsEqual } from "./use-image-settings-autosave";

describe("areImageSettingsEqual", () => {
    test("returns true for identical references and clone copies", () => {
        expect(
            areImageSettingsEqual(
                defaultImageGenerationSettings,
                defaultImageGenerationSettings,
            ),
        ).toBe(true);
        expect(
            areImageSettingsEqual(defaultImageGenerationSettings, {
                ...defaultImageGenerationSettings,
            }),
        ).toBe(true);
    });

    test("detects string, number, and boolean differences", () => {
        expect(
            areImageSettingsEqual(defaultImageGenerationSettings, {
                ...defaultImageGenerationSettings,
                masterPrompt: "different",
            }),
        ).toBe(false);

        expect(
            areImageSettingsEqual(defaultImageGenerationSettings, {
                ...defaultImageGenerationSettings,
                width: 1024,
            }),
        ).toBe(false);

        expect(
            areImageSettingsEqual(defaultImageGenerationSettings, {
                ...defaultImageGenerationSettings,
                onlyFree: true,
            }),
        ).toBe(false);
    });

    test("validates master prompt before saving", () => {
        expect(() => splitMasterPrompt("invalid without macro")).toThrow(
            "Master prompt must contain {{prompt}}.",
        );

        expect(() => splitMasterPrompt("{{prompt}} and {{prompt}} again")).toThrow(
            "Master prompt must contain {{prompt}} exactly once.",
        );

        expect(splitMasterPrompt("prefix {{prompt}} suffix")).toEqual({
            prefix: "prefix ",
            suffix: " suffix",
        });
    });
});
