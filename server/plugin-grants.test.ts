import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { BadRequestError } from "./http";
import {
    grantChangeNeedsPrivilege,
    normalizePluginGrantsState,
    pluginHasGrant,
    readPluginGrantsState,
    readPluginGrantPermissions,
    writePluginPermissionGrant,
} from "./plugin-grants";

const scratchPaths: string[] = [];

function scratchPath() {
    const pathname = join(
        tmpdir(),
        `smileychat-plugin-grants-${crypto.randomUUID()}`,
        "plugin-grants.json",
    );
    scratchPaths.push(pathname);
    return pathname;
}

afterEach(async () => {
    await Promise.all(
        scratchPaths
            .splice(0)
            .map((pathname) =>
                rm(join(pathname, ".."), { recursive: true, force: true }),
            ),
    );
});

const manifests = [
    {
        id: "image-helper",
        permissions: ["connections:secrets", "ui:settings"],
    },
    { id: "plain", permissions: ["ui:settings"] },
    { id: "server-plugin", permissions: ["server:process"] },
];

function grant(pluginId: string, permissions: unknown, pathname = scratchPath()) {
    return writePluginPermissionGrant(
        pluginId,
        { permissions },
        { readManifests: async () => manifests, pathname },
    );
}

describe("plugin permission grants", () => {
    test("empty file means nothing is granted", async () => {
        const state = await readPluginGrantsState(scratchPath());

        expect(state).toEqual({ version: 1, plugins: {} });
    });

    test("unknown permissions are dropped when the file is loaded", () => {
        const state = normalizePluginGrantsState({
            version: 1,
            plugins: {
                "image-helper": {
                    permissions: [
                        "connections:secrets",
                        "connections:secrets",
                        "made-up",
                    ],
                },
                empty: { permissions: [] },
                broken: "nope",
            },
        });

        expect(Object.keys(state.plugins)).toEqual(["image-helper"]);
        expect(state.plugins["image-helper"]?.permissions).toEqual([
            "connections:secrets",
        ]);
        expect(typeof state.plugins["image-helper"]?.grantedAt).toBe("string");
    });

    test("a declared permission can be granted and revoked", async () => {
        const pathname = scratchPath();

        const granted = await (
            await grant("image-helper", ["connections:secrets"], pathname)
        ).json();
        expect(granted.grants["image-helper"].permissions).toEqual([
            "connections:secrets",
        ]);
        expect((await readPluginGrantsState(pathname)).plugins["image-helper"]).toEqual(
            granted.grants["image-helper"],
        );

        const revoked = await (await grant("image-helper", [], pathname)).json();
        expect(revoked.grants).toEqual({});
        expect((await readPluginGrantsState(pathname)).plugins).toEqual({});
    });

    test("re-granting keeps the original approval date", async () => {
        const pathname = scratchPath();
        const first = await (
            await grant("image-helper", ["connections:secrets"], pathname)
        ).json();

        // A second write must not look like a fresh approval: the card shows
        // when the user first allowed it.
        const second = await (
            await grant("image-helper", ["connections:secrets"], pathname)
        ).json();

        expect(second.grants["image-helper"].grantedAt).toBe(
            first.grants["image-helper"].grantedAt,
        );
    });

    test("refuses a permission the plugin does not declare", async () => {
        const error = await grant("plain", ["connections:secrets"]).catch(
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as Error).message).toContain("does not declare");
    });

    test("refuses a permission that cannot be granted at runtime", async () => {
        const error = await grant("image-helper", ["chat:input"]).catch(
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as Error).message).toContain("cannot be granted at runtime");
    });

    test("refuses an unknown plugin and a malformed body", async () => {
        const unknown = await grant("missing-plugin", ["connections:secrets"]).catch(
            (caught: unknown) => caught,
        );
        expect((unknown as Error).message).toContain("is not installed");

        const malformed = await grant("image-helper", "connections:secrets").catch(
            (caught: unknown) => caught,
        );
        expect(malformed).toBeInstanceOf(BadRequestError);
    });

    test("server:process is grantable only when the manifest declares it", async () => {
        const pathname = scratchPath();

        const granted = await (
            await grant("server-plugin", ["server:process"], pathname)
        ).json();
        expect(granted.grants["server-plugin"].permissions).toEqual(["server:process"]);
        expect(await pluginHasGrant("server-plugin", "server:process", pathname)).toBe(
            true,
        );

        const undeclared = await grant("plain", ["server:process"]).catch(
            (caught: unknown) => caught,
        );
        expect(undeclared).toBeInstanceOf(BadRequestError);
        expect((undeclared as Error).message).toContain("does not declare");
    });

    test("a missing grants file means no grant", async () => {
        const pathname = scratchPath();

        expect(await pluginHasGrant("server-plugin", "server:process", pathname)).toBe(
            false,
        );
        expect(await readPluginGrantPermissions("server-plugin", pathname)).toEqual([]);
    });

    test("revoking server:process removes the grant", async () => {
        const pathname = scratchPath();

        await grant("server-plugin", ["server:process"], pathname);
        expect(await pluginHasGrant("server-plugin", "server:process", pathname)).toBe(
            true,
        );

        await grant("server-plugin", [], pathname);
        expect(await pluginHasGrant("server-plugin", "server:process", pathname)).toBe(
            false,
        );
    });

    test("granting server:process is the only change that needs privilege", () => {
        const needs = grantChangeNeedsPrivilege;

        expect(needs([], ["server:process"])).toBe(true);
        expect(needs(["connections:secrets"], ["server:process"])).toBe(true);
        expect(
            needs(["connections:secrets"], ["connections:secrets", "server:process"]),
        ).toBe(true);

        // Already approved, or not part of the request: no privilege needed.
        expect(needs(["server:process"], ["server:process"])).toBe(false);
        expect(needs(["server:process"], ["server:process", "connections:secrets"])).toBe(
            false,
        );
        expect(needs(["server:process"], [])).toBe(false);
        expect(needs(["server:process"], ["connections:secrets"])).toBe(false);
        expect(needs([], [])).toBe(false);
        expect(needs([], ["connections:secrets"])).toBe(false);
    });
});
