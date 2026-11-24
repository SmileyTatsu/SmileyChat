/**
 * Runtime grants for plugin permissions that cannot be inferred from install
 * consent alone.
 *
 * Install consent answers "which permissions does this artifact declare?", but
 * a permission like `connections:secrets` also needs a decision the user can
 * revisit after the plugin is already installed. That decision is stored here,
 * next to the other plugin state, so the answer survives restarts and can be
 * revoked without uninstalling.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { json, writeJsonAtomic, BadRequestError } from "./http";
import { logger } from "./logger";
import { pluginGrantsPath } from "./paths";
import { readPluginManifests } from "./plugins";

/**
 * Permissions a plugin may be granted at runtime.
 *
 * Anything else is covered by install consent and declaring it in the manifest,
 * so granting it here would only add a second, weaker gate.
 */
export const GRANTABLE_PLUGIN_PERMISSIONS = ["connections:secrets"] as const;

export type GrantablePluginPermission = (typeof GRANTABLE_PLUGIN_PERMISSIONS)[number];

export type PluginPermissionGrant = {
    permissions: GrantablePluginPermission[];
    grantedAt: string;
};

export type PluginGrantsState = {
    version: 1;
    plugins: Record<string, PluginPermissionGrant>;
};

export function isGrantablePluginPermission(
    value: string,
): value is GrantablePluginPermission {
    return (GRANTABLE_PLUGIN_PERMISSIONS as readonly string[]).includes(value);
}

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

type GrantDependencies = {
    readManifests: () => Promise<
        { id: string; permissions?: string[]; source?: string }[]
    >;
    /** Overridable so tests never touch the real userData file. */
    pathname?: string;
};

/**
 * Replaces the whole grant set for one plugin.
 *
 * An empty list removes the grant, which is how revocation is expressed: no
 * separate DELETE, so the UI can flip a switch in one request.
 */
export async function writePluginPermissionGrant(
    pluginId: string,
    body: unknown,
    dependencies: GrantDependencies = { readManifests: readPluginManifests },
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

    const manifest = (await dependencies.readManifests()).find(
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

export const pluginGrantsTestInternals = {
    normalizePluginGrantsState,
    isGrantablePluginPermission,
};
