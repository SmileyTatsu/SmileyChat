/**
 * Per-permission copy and behaviour for the runtime Approvals block.
 *
 * The permission itself only declares intent; this module says how it reads and
 * what a switch for it does. Keeping it in one table is what lets the grants
 * block stay markup-only: adding a grantable permission never means copying a
 * second `<li>` or a second dialog.
 */
import { messageFromError } from "#frontend/lib/common/errors";
import {
    GRANTABLE_PLUGIN_PERMISSIONS,
    isGrantablePluginPermission,
    type GrantablePluginPermission,
} from "#frontend/lib/plugins/grants";

import { describePluginPermission } from "./plugin-permissions";

export type PluginGrantIcon = "key" | "shield";

export type PluginGrantDescriptor = {
    permission: GrantablePluginPermission;
    /** Same label the permission lists use, so both never drift. */
    label: string;
    icon: PluginGrantIcon;
    /** Rendered with the amber high-impact treatment. */
    highImpact: boolean;
    /** Approving this asks again through the shared consent dialog. */
    requiresConfirmation: boolean;
    pendingNote: string;
    grantedNote: string;
    tooltip: { grant: string; revoke: string };
    /** Status line after a successful toggle; `{plugin}` is the plugin name. */
    status: { granted: string; revoked: string };
    /** Copy for the confirmation dialog; absent when none is needed. */
    confirm?: { title: string; intro: string; note: string };
};

type GrantCopy = Omit<PluginGrantDescriptor, "label" | "highImpact">;

const GRANT_COPY: Record<GrantablePluginPermission, GrantCopy> = {
    "connections:secrets": {
        permission: "connections:secrets",
        icon: "key",
        requiresConfirmation: false,
        pendingNote:
            "Needs your approval before it can read saved API keys. Only enable this for plugins you trust with those keys.",
        grantedNote:
            "Can read the API keys saved for your model connections until you turn this off.",
        tooltip: {
            grant: "Allow access to connection secrets",
            revoke: "Revoke access to connection secrets",
        },
        status: {
            granted: "Allowed {plugin} to read connection secrets.",
            revoked: "Revoked connection secret access for {plugin}.",
        },
    },
    "server:process": {
        permission: "server:process",
        icon: "shield",
        requiresConfirmation: true,
        pendingNote:
            "Not approved. Its server part stays off until you allow it to run programs on this computer.",
        grantedNote:
            "Can run programs on this computer and use your files and graphics card until you turn this off.",
        tooltip: {
            grant: "Approve running programs on your computer",
            revoke: "Revoke permission to run programs on your computer",
        },
        status: {
            granted: "Allowed {plugin} to run programs on this computer.",
            revoked: "Revoked permission to run programs for {plugin}.",
        },
        confirm: {
            title: "Allow {plugin} to run programs?",
            intro: "{plugin} will start a server part on this computer. That part can launch programs and use your files and graphics card, outside the browser. Only approve it if you trust this plugin.",
            note: "You can revoke this from Approvals at any time without uninstalling the plugin.",
        },
    },
};

export function describePluginGrant(
    permission: string,
): PluginGrantDescriptor | undefined {
    const key = permission.trim();

    if (!isGrantablePluginPermission(key)) {
        return undefined;
    }

    const copy = GRANT_COPY[key];
    const described = describePluginPermission(key);

    return {
        ...copy,
        label: described.label,
        highImpact: described.highImpact,
    };
}

/** Grants that run code outside the browser are read before the rest. */
function grantPriority(grant: PluginGrantDescriptor) {
    const runsOnHost = grant.permission === "server:process" ? 1 : 0;
    return runsOnHost * 2 + Number(grant.highImpact);
}

/**
 * Approvals to offer for a manifest: only what it declares, only what can be
 * granted at runtime, the ones that touch the computer first.
 */
export function describePluginGrants(
    declared: readonly string[] | undefined,
): PluginGrantDescriptor[] {
    const offered = GRANTABLE_PLUGIN_PERMISSIONS.map((permission) =>
        describePluginGrant(permission),
    ).filter((grant): grant is PluginGrantDescriptor => grant !== undefined);

    return offered
        .filter((grant) => (declared ?? []).includes(grant.permission))
        .sort((left, right) => grantPriority(right) - grantPriority(left));
}

/** Fills the `{plugin}` slot the descriptor templates use. */
export function pluginGrantCopy(template: string, pluginName: string) {
    return template.replace(/\{plugin\}/g, pluginName);
}

export function pluginGrantStatusMessage(
    permission: string,
    pluginName: string,
    granted: boolean,
) {
    const grant = describePluginGrant(permission);

    if (!grant) {
        return `${granted ? "Allowed" : "Revoked"} ${permission} for ${pluginName}.`;
    }

    return pluginGrantCopy(
        granted ? grant.status.granted : grant.status.revoked,
        pluginName,
    );
}

/**
 * The server refuses a grant when the browser is not on the machine that runs
 * SmileyChat and no admin secret was supplied. That is a normal answer, not a
 * bug, so it gets its own sentence instead of the raw request failure.
 */
export const PLUGIN_GRANT_LOCAL_ONLY_MESSAGE =
    "Approving this needs the computer running SmileyChat (or its admin secret).";

export function isForbiddenPluginGrantError(error: unknown) {
    const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "";

    // `requestJson` turns the status into text: "PUT /api/plugins/grants/x failed: 403 - ...".
    return /\bfailed:\s*403\b/.test(message);
}

export function pluginGrantErrorMessage(error: unknown) {
    if (isForbiddenPluginGrantError(error)) {
        return PLUGIN_GRANT_LOCAL_ONLY_MESSAGE;
    }

    return messageFromError(error, "Could not save the plugin approval.");
}
