import { expect, test } from "bun:test";

import { APP_VERSION } from "../app-version";
import {
    checkPluginCompatibility,
    PLUGIN_API_VERSION,
    pluginCompatibilityError,
} from "./compatibility";

const APP = "1.4.0";

test("plugins without api fields keep loading", () => {
    expect(checkPluginCompatibility({ id: "legacy" }, APP)).toEqual({
        compatible: true,
    });
});

test("the current plugin API version is accepted", () => {
    expect(
        checkPluginCompatibility({ id: "current", apiVersion: PLUGIN_API_VERSION }, APP),
    ).toEqual({ compatible: true });
});

test("a newer plugin API version is rejected with a clear reason", () => {
    const result = checkPluginCompatibility(
        { id: "future", name: "Future Plugin", apiVersion: PLUGIN_API_VERSION + 1 },
        APP,
    );

    expect(result.compatible).toBe(false);

    if (!result.compatible) {
        expect(result.reason).toContain("Future Plugin targets plugin API");
        expect(result.reason).toContain(`plugin API ${PLUGIN_API_VERSION}`);
        expect(result.reason).toContain("Update SmileyChat");
    }
});

test("malformed apiVersion is rejected instead of silently ignored", () => {
    for (const apiVersion of ["2", 0, -1, 1.5, Number.NaN, null]) {
        const result = checkPluginCompatibility({ id: "bad", apiVersion }, APP);

        expect(result.compatible).toBe(false);

        if (!result.compatible) {
            expect(result.reason).toContain("invalid apiVersion");
        }
    }
});

test("minAppVersion newer than the running app is rejected", () => {
    const result = checkPluginCompatibility(
        { id: "needs-newer", name: "Newer", minAppVersion: "1.5.0" },
        APP,
    );

    expect(result.compatible).toBe(false);

    if (!result.compatible) {
        expect(result.reason).toBe(
            "Newer needs SmileyChat 1.5.0 or newer. This is SmileyChat 1.4.0.",
        );
    }
});

test("minAppVersion equal to or older than the running app is accepted", () => {
    expect(checkPluginCompatibility({ id: "same", minAppVersion: "1.4.0" }, APP)).toEqual(
        { compatible: true },
    );
    expect(
        checkPluginCompatibility({ id: "older", minAppVersion: "v1.0.0" }, APP),
    ).toEqual({ compatible: true });
});

test("a prerelease app build does not satisfy a newer stable minAppVersion", () => {
    expect(
        checkPluginCompatibility({ id: "pre", minAppVersion: "1.5.0" }, "1.5.0-rc.1")
            .compatible,
    ).toBe(false);
    expect(
        checkPluginCompatibility({ id: "pre", minAppVersion: "1.5.0-rc.1" }, "1.5.0-rc.1")
            .compatible,
    ).toBe(true);
});

test("malformed minAppVersion is rejected instead of silently ignored", () => {
    for (const minAppVersion of ["", "next", "1.2.3.4", 1, null]) {
        const result = checkPluginCompatibility({ id: "bad", minAppVersion }, APP);

        expect(result.compatible).toBe(false);

        if (!result.compatible) {
            expect(result.reason).toContain("invalid minAppVersion");
        }
    }
});

test("core extensions are exempt from the contract", () => {
    expect(
        checkPluginCompatibility(
            { id: "smiley-mcp", source: "core", apiVersion: 99, minAppVersion: "9.0.0" },
            APP,
        ),
    ).toEqual({ compatible: true });
});

test("pluginCompatibilityError returns the reason or undefined", () => {
    expect(pluginCompatibilityError({ id: "ok" }, APP)).toBeUndefined();
    expect(pluginCompatibilityError({ id: "no", minAppVersion: "9.0.0" }, APP)).toContain(
        "needs SmileyChat 9.0.0 or newer",
    );
});

test("the app version is a valid version string", () => {
    expect(
        pluginCompatibilityError({ id: "self", minAppVersion: APP_VERSION }, APP_VERSION),
    ).toBeUndefined();
});
