import { describe, expect, test } from "bun:test";

import { buildAppliedEnabledMap, isStateCustom, type PluginProfile } from "./profiles";

const defaultProfile: PluginProfile = {
    builtin: true,
    enabledPlugins: {},
    id: "default",
    name: "Default",
};

describe("plugin profile defaults", () => {
    test("uses each plugin manifest's default enabled state", () => {
        const expected = buildAppliedEnabledMap(defaultProfile, [
            { id: "enabled", defaultEnabled: true },
            { id: "disabled", defaultEnabled: false },
        ]);

        expect(expected).toEqual({ enabled: true, disabled: false });
        expect(isStateCustom({ enabled: true, disabled: false }, expected)).toBe(false);
    });

    test("marks a changed disabled-by-default plugin as custom", () => {
        const expected = buildAppliedEnabledMap(defaultProfile, [
            { id: "disabled", defaultEnabled: false },
        ]);

        expect(isStateCustom({ disabled: true }, expected)).toBe(true);
    });
});
