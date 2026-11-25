import { describe, expect, test } from "bun:test";

import {
    describePluginGrant,
    describePluginGrants,
    isForbiddenPluginGrantError,
    PLUGIN_GRANT_LOCAL_ONLY_MESSAGE,
    pluginGrantCopy,
    pluginGrantErrorMessage,
    pluginGrantStatusMessage,
} from "./plugin-grant-descriptors";

describe("describePluginGrant", () => {
    test("reuses the permission label and flags the computer permission", () => {
        expect(describePluginGrant("server:process")).toMatchObject({
            permission: "server:process",
            label: "Run programs on your computer",
            icon: "shield",
            highImpact: true,
            requiresConfirmation: true,
        });
        expect(describePluginGrant("connections:secrets")).toMatchObject({
            permission: "connections:secrets",
            label: "Use connection secrets",
            icon: "key",
            highImpact: true,
            requiresConfirmation: false,
        });
    });

    test("has copy for both states and a confirmation only where one is needed", () => {
        const server = describePluginGrant("server:process");
        expect(server?.pendingNote).toContain("Not approved");
        expect(server?.grantedNote).toContain("Can run programs");
        expect(server?.tooltip.grant).toContain("Approve");
        expect(server?.confirm?.title).toBe("Allow {plugin} to run programs?");

        const secrets = describePluginGrant("connections:secrets");
        expect(secrets?.confirm).toBeUndefined();
        expect(secrets?.pendingNote).toContain("Needs your approval");
    });

    test("ignores permissions that cannot be granted at runtime", () => {
        expect(describePluginGrant("network:fetch")).toBeUndefined();
        expect(describePluginGrant("")).toBeUndefined();
    });
});

describe("describePluginGrants", () => {
    test("offers only declared grantable permissions, computer first", () => {
        expect(
            describePluginGrants(["connections:secrets", "server:process"]).map(
                (grant) => grant.permission,
            ),
        ).toEqual(["server:process", "connections:secrets"]);

        expect(
            describePluginGrants(["server:process", "network:fetch"]).map(
                (grant) => grant.permission,
            ),
        ).toEqual(["server:process"]);

        expect(describePluginGrants(["ui:styles"])).toEqual([]);
        expect(describePluginGrants(undefined)).toEqual([]);
    });
});

describe("grant status and error copy", () => {
    test("keeps the existing sentence for connection secrets", () => {
        expect(pluginGrantStatusMessage("connections:secrets", "Lorebook", true)).toBe(
            "Allowed Lorebook to read connection secrets.",
        );
        expect(pluginGrantStatusMessage("connections:secrets", "Lorebook", false)).toBe(
            "Revoked connection secret access for Lorebook.",
        );
    });

    test("names the permission for the server module", () => {
        expect(pluginGrantStatusMessage("server:process", "Tools", true)).toBe(
            "Allowed Tools to run programs on this computer.",
        );
        expect(pluginGrantStatusMessage("server:process", "Tools", false)).toBe(
            "Revoked permission to run programs for Tools.",
        );
    });

    test("falls back for a permission without copy", () => {
        expect(pluginGrantStatusMessage("vendor:extra", "Tools", true)).toBe(
            "Allowed vendor:extra for Tools.",
        );
    });

    test("turns the 403 answer into the local-computer sentence", () => {
        const forbidden = new Error(
            "PUT /api/plugins/grants/smiley-tools failed: 403 - Requests that grant plugin permissions must come from the computer running SmileyChat.",
        );
        expect(isForbiddenPluginGrantError(forbidden)).toBe(true);
        expect(pluginGrantErrorMessage(forbidden)).toBe(PLUGIN_GRANT_LOCAL_ONLY_MESSAGE);
        expect(pluginGrantErrorMessage(forbidden)).toBe(
            "Approving this needs the computer running SmileyChat (or its admin secret).",
        );
    });

    test("does not mistake other failures for a 403", () => {
        const notInstalled = new Error(
            "PUT /api/plugins/grants/x failed: 400 - Plugin 'x' is not installed.",
        );
        expect(isForbiddenPluginGrantError(notInstalled)).toBe(false);
        expect(pluginGrantErrorMessage(notInstalled)).toBe(notInstalled.message);
        expect(isForbiddenPluginGrantError(undefined)).toBe(false);
        expect(pluginGrantErrorMessage(undefined)).toBe(
            "Could not save the plugin approval.",
        );
        expect(pluginGrantErrorMessage(new Error("offline"))).toBe("offline");
    });

    test("fills the plugin name into templates", () => {
        expect(pluginGrantCopy("Allow {plugin} to run programs?", "Tools")).toBe(
            "Allow Tools to run programs?",
        );
    });
});
