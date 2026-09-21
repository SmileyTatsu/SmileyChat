import { describe, expect, test } from "bun:test";

import { arePluginSettingsEqual } from "./use-plugin-settings-autosave";

describe("arePluginSettingsEqual", () => {
    test("handles primitives, nulls, and exact references", () => {
        expect(arePluginSettingsEqual(1, 1)).toBe(true);
        expect(arePluginSettingsEqual(1, 2)).toBe(false);
        expect(arePluginSettingsEqual("a", "a")).toBe(true);
        expect(arePluginSettingsEqual("a", "b")).toBe(false);
        expect(arePluginSettingsEqual(null, null)).toBe(true);
        expect(arePluginSettingsEqual(null, undefined)).toBe(false);
        expect(arePluginSettingsEqual(true, true)).toBe(true);
        expect(arePluginSettingsEqual(true, false)).toBe(false);
    });

    test("compares shallow and nested objects", () => {
        expect(arePluginSettingsEqual({ a: 1, b: "hello" }, { a: 1, b: "hello" })).toBe(
            true,
        );
        expect(arePluginSettingsEqual({ a: 1, b: "hello" }, { a: 2, b: "hello" })).toBe(
            false,
        );
        expect(arePluginSettingsEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);

        expect(
            arePluginSettingsEqual(
                { nested: { x: [1, 2, 3], y: true } },
                { nested: { x: [1, 2, 3], y: true } },
            ),
        ).toBe(true);

        expect(
            arePluginSettingsEqual(
                { nested: { x: [1, 2, 3], y: true } },
                { nested: { x: [1, 2, 4], y: true } },
            ),
        ).toBe(false);
    });

    test("compares arrays accurately", () => {
        expect(arePluginSettingsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(arePluginSettingsEqual([1, 2, 3], [1, 2])).toBe(false);
        expect(arePluginSettingsEqual([{ id: "a" }], [{ id: "a" }])).toBe(true);
        expect(arePluginSettingsEqual([{ id: "a" }], [{ id: "b" }])).toBe(false);
    });
});
