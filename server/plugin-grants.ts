/**
 * Runtime grants for plugin permissions that cannot be inferred from install
 * consent alone.
 *
 * Install consent answers "which permissions does this artifact declare?", but
 * a permission like `connections:secrets` or `server:process` also needs a
 * decision the user can revisit after the plugin is already installed. That
 * decision is stored here, next to the other plugin state, so the answer
 * survives restarts and can be revoked without uninstalling.
 *
 * The list of grantable permissions lives in the shared plugin catalog: the
 * client must offer exactly what this module accepts.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
    GRANTABLE_PLUGIN_PERMISSIONS,
    isGrantablePluginPermission,
    type GrantablePluginPermission,
} from "#frontend/lib/plugins/core-catalog";

import { json, writeJsonAtomic, BadRequestError } from "./http";
import { logger } from "./logger";
import { pluginGrantsPath } from "./paths";

export { GRANTABLE_PLUGIN_PERMISSIONS, isGrantablePluginPermission };
export type { GrantablePluginPermission };

export type PluginPermissionGrant = {
    permissions: GrantablePluginPermission[];
    grantedAt: string;
};

export type PluginGrantsState = {
    version: 1;
    plugins: Record<string, PluginPermissionGrant>;
};

export function defaultPluginGrantsState(): PluginGrantsState {
    return { version: 1, plugins: {} };
}

export function normalizePluginGrantsState(input: unknown): PluginGrantsState {
    const source = (input ?? {}) as {
        plugins?: Record<string, { permissions?: unknown; grantedAt?: unknown }>;
    };
    const plugins: Record<string, PluginPermissionGrant> = {};

    for (const [pluginId, grant] of Object.entries(source.plugins ?? {})) {
        if (!pluginId.trim() || typeof grant !== "object" || grant === null) {
            continue;
        }

        const permissions = Array.isArray(grant.permissions)
            ? Array.from(
                  new Set(
                      grant.permissions.filter(
                          (permission): permission is GrantablePluginPermission =>
                              typeof permission === "string" &&
                              isGrantablePluginPermission(permission),
                      ),
                  ),
              )
            : [];

        if (!permissions.length) {
            continue;
        }

        plugins[pluginId] = {
            permissions,
            grantedAt:
                typeof grant.grantedAt === "string" && grant.grantedAt.trim()
                    ? grant.grantedAt
                    : new Date().toISOString(),
        };
    }

    return { version: 1, plugins };
}

export async function readPluginGrantsState(
    pathname: string = pluginGrantsPath,
): Promise<PluginGrantsState> {
    const file = Bun.file(pathname);

    if (!(await file.exists())) {
        return defaultPluginGrantsState();
    }

    try {
        return normalizePluginGrantsState(await file.json());
    } catch (error) {
        logger.warn("plugins", "Could not parse plugin-grants.json; using no grants", {
            error: error instanceof Error ? error.message : String(error),
        });
        return defaultPluginGrantsState();
    }
}

export async function readPluginGrants() {
    const state = await readPluginGrantsState();
    return json({ version: state.version, grants: state.plugins });
}

/**
 * Permissions currently granted to one plugin. A missing or unreadable grants
 * file answers an empty list, so every caller fails closed.
 */
export async function readPluginGrantPermissions(
    pluginId: string,
    pathname: string = pluginGrantsPath,
): Promise<GrantablePluginPermission[]> {
    const state = await readPluginGrantsState(pathname);

    return [...(state.plugins[pluginId]?.permissions ?? [])];
}

/** Whether the user approved one runtime permission for a plugin. */
export async function pluginHasGrant(
    pluginId: string,
    permission: GrantablePluginPermission,
    pathname: string = pluginGrantsPath,
): Promise<boolean> {
    const permissions = await readPluginGrantPermissions(pluginId, pathname);

    return permissions.includes(permission);
}

/**
 * Whether a grant change hands the plugin new power over this machine.
 *
 * Adding `server:process` lets the plugin run arbitrary programs as the user,
 * so that one change needs the same privileged access as
 * `/api/connections/secrets`. Revoking it, or leaving it as it was, never does.
 */
export function grantChangeNeedsPrivilege(
    currentPermissions: readonly string[],
    requestedPermissions: readonly string[],
): boolean {
    if (!requestedPermissions.includes("server:process")) {
        return false;
    }

    return !currentPermissions.includes("server:process");
}

type GrantDependencies = {
    readManifests?: () => Promise<
        { id: string; permissions?: string[]; source?: string }[]
    >;
    /** Overridable so tests never touch the real userData file. */
    pathname?: string;
};

/**
 * `server/plugins.ts` imports this module for the discovery and replacement
 * gates, so the manifest list is imported lazily instead of at module load: a
 * static import back would be a cycle.
 */
async function defaultReadManifests() {
    const { readPluginManifests } = await import("./plugins");

    return readPluginManifests();
}

/**
 * Replaces the whole grant set for one plugin.
 *
 * An empty list removes the grant, which is how revocation is expressed: no
 * separate DELETE, so the UI can flip a switch in one request.
 */
export async function writePluginPermissionGrant(
    pluginId: string,
    body: unknown,
    dependencies: GrantDependencies = {},
) {
    const requested = (body ?? {}) as { permissions?: unknown };

    if (!Array.isArray(requested.permissions)) {
        throw new BadRequestError("permissions must be an array of permission names.");
    }

    const requestedPermissions = requested.permissions.filter(
        (value): value is string => typeof value === "string",
    );
    const unknownPermission = requestedPermissions.find(
        (permission) => !isGrantablePluginPermission(permission),
    );

    if (unknownPermission) {
        throw new BadRequestError(
            `Permission '${unknownPermission}' cannot be granted at runtime.`,
        );
    }

    const readManifests = dependencies.readManifests ?? defaultReadManifests;
    const manifest = (await readManifests()).find(
        (candidate) => candidate.id === pluginId,
    );

    if (!manifest) {
        throw new BadRequestError(`Plugin '${pluginId}' is not installed.`);
    }

    // Granting a permission the artifact never asked for would leave a grant
    // that no load path checks; refuse it so manifest and grant stay in sync.
    const notDeclared = requestedPermissions.find(
        (permission) => !(manifest.permissions ?? []).includes(permission),
    );

    if (notDeclared) {
        throw new BadRequestError(
            `Plugin '${pluginId}' does not declare '${notDeclared}'.`,
        );
    }

    const pathname = dependencies.pathname ?? pluginGrantsPath;
    const state = await readPluginGrantsState(pathname);
    const permissions = Array.from(
        new Set(requestedPermissions),
    ) as GrantablePluginPermission[];

    if (permissions.length) {
        state.plugins[pluginId] = {
            permissions,
            // Re-granting an existing permission must not move the date: the UI
            // shows when the user first approved it.
            grantedAt: state.plugins[pluginId]?.grantedAt ?? new Date().toISOString(),
        };
    } else {
        delete state.plugins[pluginId];
    }

    await mkdir(dirname(pathname), { recursive: true });
    await writeJsonAtomic(pathname, state);

    return json({ version: state.version, grants: state.plugins });
}

/**
 * Drops every runtime grant of one plugin.
 *
 * Approval belongs to the code the user approved: reinstalling the same id
 * ships different code, so an uninstall must take the grant with it and a
 * reinstall has to ask again. This covers `connections:secrets` and
 * `server:process` alike, because they share this file and the same semantics.
 *
 * A plugin without an entry is a no-op, and a grants file that cannot be
 * rewritten is logged instead of thrown: a completed uninstall must not become
 * a failure because cleanup of a settings file went wrong.
 */
export async function clearPluginGrants(
    pluginId: string,
    pathname: string = pluginGrantsPath,
): Promise<void> {
    try {
        const state = await readPluginGrantsState(pathname);

        if (!state.plugins[pluginId]) {
            return;
        }

        delete state.plugins[pluginId];
        await mkdir(dirname(pathname), { recursive: true });
        await writeJsonAtomic(pathname, state);
        logger.info("plugins", `Cleared the runtime grants of ${pluginId}`);
    } catch (error) {
        logger.error("plugins", `Could not clear the runtime grants of ${pluginId}`, {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export const pluginGrantsTestInternals = {
    normalizePluginGrantsState,
    isGrantablePluginPermission,
    grantChangeNeedsPrivilege,
};
