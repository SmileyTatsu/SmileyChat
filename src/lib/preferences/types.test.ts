import { describe, expect, test } from "bun:test";

import { defaultAppPreferences, normalizeAppPreferences } from "./types";

describe("app preference normalization", () => {
    test("adds defaults for new appearance preferences", () => {
        const preferences = normalizeAppPreferences({ appearance: {} });

        expect(preferences.appearance.timeFormat).toBe("12h");
        expect(preferences.appearance.hideNamePrefixInMessages).toBe(true);
        expect(preferences.appearance.codeblockFontFamily).toBe("");
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

    test("preserves and sanitizes the codeblock font preference", () => {
        const preferences = normalizeAppPreferences({
            appearance: {
                codeblockFontFamily: '"JetBrains Mono"; color: red',
            },
        });

        expect(preferences.appearance.codeblockFontFamily).toBe(
            '"JetBrains Mono" color: red',
        );
    });

    test("rejects invalid hour formats", () => {
        const preferences = normalizeAppPreferences({
            appearance: { timeFormat: "locale" },
        });

        expect(preferences.appearance.timeFormat).toBe(
            defaultAppPreferences.appearance.timeFormat,
        );
    });

    test("preserves hideNamePrefixInMessages preference", () => {
        const preferences = normalizeAppPreferences({
            appearance: { hideNamePrefixInMessages: false },
        });
        expect(preferences.appearance.hideNamePrefixInMessages).toBe(false);
    });

    test("defaults and clamps the media window", () => {
        const defaults = normalizeAppPreferences({ chat: {} });

        expect(defaults.chat.mediaWindow).toEqual({
            maxActiveImages: 2,
            maxActiveFiles: 2,
            maxMessageDistance: 6,
        });

        const clamped = normalizeAppPreferences({
            chat: { mediaWindow: { maxActiveImages: 40, maxActiveFiles: -5 } },
        });

        expect(clamped.chat.mediaWindow.maxActiveImages).toBe(10);
        expect(clamped.chat.mediaWindow.maxActiveFiles).toBe(0);
        expect(clamped.chat.mediaWindow.maxMessageDistance).toBe(6);
    });

    test("defaults and clamps the image transport and attachment limits", () => {
        const defaults = normalizeAppPreferences({ chat: {} });

        expect(defaults.chat.imageTransport).toEqual({
            maxDimension: 1568,
            jpegQualityPercent: 85,
        });
        expect(defaults.chat.attachmentLimits).toEqual({
            imageMegabytes: 25,
            fileMegabytes: 48,
            perMessage: 10,
        });

        const clamped = normalizeAppPreferences({
            chat: {
                imageTransport: { maxDimension: -20, jpegQualityPercent: 5 },
                attachmentLimits: { imageMegabytes: 999, perMessage: 0 },
            },
        });

        expect(clamped.chat.imageTransport).toEqual({
            maxDimension: 0,
            jpegQualityPercent: 50,
        });
        expect(clamped.chat.attachmentLimits.imageMegabytes).toBe(256);
        expect(clamped.chat.attachmentLimits.perMessage).toBe(1);
    });

    test("defaults and clamps trash retention", () => {
        const defaults = normalizeAppPreferences({ chat: {} });

        expect(defaults.chat.trashRetention).toEqual({ keepCount: 40, keepDays: 7 });

        expect(
            normalizeAppPreferences({
                chat: { trashRetention: { keepCount: -3, keepDays: 0 } },
            }).chat.trashRetention,
        ).toEqual({ keepCount: 0, keepDays: 1 });

        expect(
            normalizeAppPreferences({
                chat: { trashRetention: { keepCount: 4000, keepDays: 9999 } },
            }).chat.trashRetention,
        ).toEqual({ keepCount: 500, keepDays: 365 });
    });

    test("normalizes the default chat theme preference", () => {
        expect(
            normalizeAppPreferences({ appearance: { defaultChatTheme: "rp" } }).appearance
                .defaultChatTheme,
        ).toBe("rp");
        expect(
            normalizeAppPreferences({ appearance: { defaultChatTheme: "bubbles" } })
                .appearance.defaultChatTheme,
        ).toBe("bubbles");
        expect(
            normalizeAppPreferences({ appearance: { defaultChatTheme: "invalid-theme" } })
                .appearance.defaultChatTheme,
        ).toBe("chat");
    });

    test("reads the old global chatTheme key as the default theme", () => {
        expect(
            normalizeAppPreferences({ appearance: { chatTheme: "rp" } }).appearance
                .defaultChatTheme,
        ).toBe("rp");
        expect(
            normalizeAppPreferences({
                appearance: { chatTheme: "rp", defaultChatTheme: "bubbles" },
            }).appearance.defaultChatTheme,
        ).toBe("bubbles");
    });

    test("normalizes the tool iteration limit", () => {
        expect(
            normalizeAppPreferences({ chat: { toolIterationLimit: 99 } }).chat
                .toolIterationLimit,
        ).toBe(32);
        expect(
            normalizeAppPreferences({ chat: { toolIterationLimit: 12 } }).chat
                .toolIterationLimit,
        ).toBe(12);
    });

    test("defaults and preserves the tool call count preference", () => {
        expect(normalizeAppPreferences({ chat: {} }).chat.showToolCallCount).toBe(true);
        expect(
            normalizeAppPreferences({ chat: { showToolCallCount: false } }).chat
                .showToolCallCount,
        ).toBe(false);
    });

    test("defaults the model picker limit when older files lack it", () => {
        expect(normalizeAppPreferences({ layout: {} }).layout.modelPickerLimit).toBe(250);
        expect(
            normalizeAppPreferences({
                layout: { characterPanelOpenByDefault: false },
            }).layout.modelPickerLimit,
        ).toBe(250);
    });

    test("clamps the model picker limit to the supported range", () => {
        expect(
            normalizeAppPreferences({ layout: { modelPickerLimit: 10 } }).layout
                .modelPickerLimit,
        ).toBe(50);
        expect(
            normalizeAppPreferences({ layout: { modelPickerLimit: 5000 } }).layout
                .modelPickerLimit,
        ).toBe(2000);
        expect(
            normalizeAppPreferences({ layout: { modelPickerLimit: 400.6 } }).layout
                .modelPickerLimit,
        ).toBe(401);
    });
});
