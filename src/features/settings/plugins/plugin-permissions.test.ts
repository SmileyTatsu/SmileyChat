import { expect, test } from "bun:test";

import {
    describePluginPermission,
    describePluginPermissions,
    findNewPluginPermissions,
    formatPluginPermissionList,
    isHighImpactPermission,
} from "./plugin-permissions";

test("known permissions get plain-language labels and high-impact flags", () => {
    expect(describePluginPermission("network:fetch")).toEqual({
        key: "network:fetch",
        label: "Fetch web requests",
        description: "Sends requests from your machine to sites outside SmileyChat.",
        highImpact: true,
    });
    expect(describePluginPermission("ui:styles")).toMatchObject({
        label: "Add styles",
        highImpact: false,
    });
});

test("high-impact list covers the permissions that read, spend, or rewrite data", () => {
    for (const permission of [
        "state:read",
        "model:generate",
        "network:fetch",
        "connections:secrets",
        "chat:input",
        "chat:prompt",
        "chat:output",
        "chat:message-update",
        "actions",
        "tools:register",
    ]) {
        expect(isHighImpactPermission(permission)).toBe(true);
    }

    expect(isHighImpactPermission("ui:settings")).toBe(false);
});

test("unknown permissions fall back to a readable label", () => {
    expect(describePluginPermission("vendor:extra_thing")).toMatchObject({
        key: "vendor:extra_thing",
        label: "Vendor Extra Thing",
        highImpact: false,
    });
    expect(describePluginPermission("vendor:extra_thing").description).toContain(
        "No description available",
    );
});

test("describePluginPermissions trims, drops blanks, and dedupes", () => {
    expect(
        describePluginPermissions([
            " state:read ",
            "",
            "  ",
            "state:read",
            "chat:output",
        ]).map((permission) => permission.key),
    ).toEqual(["state:read", "chat:output"]);
    expect(describePluginPermissions(undefined)).toEqual([]);
});

test("findNewPluginPermissions reports only newly requested permissions", () => {
    expect(
        findNewPluginPermissions(["state:read", "network:fetch"], ["state:read"]),
    ).toEqual(["network:fetch"]);
    expect(
        findNewPluginPermissions(["state:read"], ["state:read", "chat:output"]),
    ).toEqual([]);
    expect(findNewPluginPermissions(["state:read"], undefined)).toEqual(["state:read"]);
    expect(findNewPluginPermissions(undefined, ["state:read"])).toEqual([]);
    expect(findNewPluginPermissions([" state:read ", "state:read"], [])).toEqual([
        "state:read",
    ]);
});

test("formatPluginPermissionList joins labels for prose", () => {
    expect(formatPluginPermissionList(["chat:output"])).toBe("Rewrite AI replies");
    expect(formatPluginPermissionList(["chat:output", "ui:styles"])).toBe(
        "Rewrite AI replies and Add styles",
    );
    expect(formatPluginPermissionList(["chat:output", "ui:styles", "state:read"])).toBe(
        "Rewrite AI replies, Add styles, and Read app state",
    );
    expect(formatPluginPermissionList([])).toBe("");
});
