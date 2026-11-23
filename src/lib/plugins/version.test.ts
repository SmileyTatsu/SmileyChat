import { describe, expect, test } from "bun:test";

import { compareVersions, isNewerVersion } from "./version";

describe("compareVersions", () => {
    test("treats equal versions as equal", () => {
        expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
        expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
        expect(compareVersions(" V1.2.3 ", "1.2.3")).toBe(0);
    });

    test("compares core components numerically", () => {
        expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
        expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.10", "1.0.2")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
        expect(compareVersions("1.0.1", "1.1.0")).toBeLessThan(0);
        expect(compareVersions("1.1.0", "2.0.0")).toBeLessThan(0);
    });

    test("fills omitted minor and patch components with zero", () => {
        expect(compareVersions("1", "1.0.0")).toBe(0);
        expect(compareVersions("1.2", "1.2.0")).toBe(0);
        expect(compareVersions("1.2", "1.2.1")).toBeLessThan(0);
    });

    test("orders prereleases before the matching release", () => {
        expect(compareVersions("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
        expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0-alpha", "0.9.9")).toBeGreaterThan(0);
    });

    test("follows semver prerelease precedence", () => {
        const chain = [
            "1.0.0-alpha",
            "1.0.0-alpha.1",
            "1.0.0-alpha.beta",
            "1.0.0-beta",
            "1.0.0-beta.2",
            "1.0.0-beta.11",
            "1.0.0-rc.1",
            "1.0.0",
        ];

        for (let index = 1; index < chain.length; index += 1) {
            expect(compareVersions(chain[index - 1], chain[index])).toBeLessThan(0);
            expect(compareVersions(chain[index], chain[index - 1])).toBeGreaterThan(0);
        }
    });

    test("ignores build metadata", () => {
        expect(compareVersions("1.0.0+build.1", "1.0.0")).toBe(0);
        expect(compareVersions("1.0.0+build.2", "1.0.0+build.1")).toBe(0);
        expect(compareVersions("1.0.0-beta+exp.sha.5114f85", "1.0.0-beta")).toBe(0);
        expect(compareVersions("1.0.0+build.1", "1.0.1")).toBeLessThan(0);
    });

    test("ranks malformed versions below valid versions", () => {
        for (const malformed of ["", "   ", "v", "abc", "1.x.0", "1.0.0.0", "1.0.0-"]) {
            expect(compareVersions(malformed, "0.0.1")).toBeLessThan(0);
            expect(compareVersions("0.0.1", malformed)).toBeGreaterThan(0);
            expect(compareVersions(malformed, malformed)).toBe(0);
        }
    });

    test("does not throw for unexpected input", () => {
        expect(() => compareVersions("1.0.0", "not a version")).not.toThrow();
    });
});

describe("isNewerVersion", () => {
    test("reports only strictly newer versions", () => {
        expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
        expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
        expect(isNewerVersion("1.0.0", "1.1.0")).toBe(false);
        expect(isNewerVersion("1.0.0", "1.0.0-beta")).toBe(true);
        expect(isNewerVersion("1.0.0-beta", "1.0.0")).toBe(false);
    });

    test("never treats a malformed registry version as an update", () => {
        expect(isNewerVersion("not-a-version", "1.0.0")).toBe(false);
        expect(isNewerVersion("1.0.0", "not-a-version")).toBe(true);
    });
});
