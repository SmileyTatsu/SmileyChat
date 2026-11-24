/**
 * Client cache of the runtime permission grants stored on the server.
 *
 * `createPluginApi` needs the answer synchronously, so the grant set is loaded
 * once before plugins activate and then kept in module state. Every path that
 * can activate a plugin awaits `loadPluginPermissionGrants()` first, which is
 * why the cache is shared instead of being passed down through props.
 */
import {
    loadPluginPermissionGrants as requestPluginGrants,
    savePluginPermissionGrant as persistPluginGrant,
} from "../api/client";
import {
    GRANTABLE_PLUGIN_PERMISSIONS,
    isGrantablePluginPermission,
    type GrantablePluginPermission,
} from "./core-catalog";

/**
 * The grantable list and its guard live in `core-catalog.ts` so the UI and the
 * server cannot drift; this module re-exports them for existing importers.
 */
export { GRANTABLE_PLUGIN_PERMISSIONS, isGrantablePluginPermission };
export type { GrantablePluginPermission };

export type PluginPermissionGrant = {
    permissions: string[];
    grantedAt: string;
};

export type PluginGrantsPayload = {
    version: 1;
    grants: Record<string, PluginPermissionGrant>;
};

const emptyPayload = (): PluginGrantsPayload => ({ version: 1, grants: {} });

let cached: PluginGrantsPayload | undefined;
let inflight: Promise<PluginGrantsPayload> | undefined;

export function getCachedPluginGrants(): PluginGrantsPayload {
    return cached ?? emptyPayload();
}

export function getPluginGrantedPermissions(pluginId: string): string[] {
    return cached?.grants[pluginId]?.permissions ?? [];
}

export function hasPluginPermissionGrant(pluginId: string, permission: string) {
    return getPluginGrantedPermissions(pluginId).includes(permission);
}

/**
 * Loads the grant set once per page load.
 *
 * A failed request must not block activation: treating every plugin as
 * ungranted keeps secrets behind the explicit approval and lets the plugin
 * still load the rest of its UI.
 */
export async function loadPluginPermissionGrants(
    force = false,
): Promise<PluginGrantsPayload> {
    if (!force && cached) {
        return cached;
    }

    if (!force && inflight) {
        return inflight;
    }

    inflight = (async () => {
        try {
            const payload = await requestPluginGrants();
            cached = { version: 1, grants: payload.grants ?? {} };
        } catch {
            cached = emptyPayload();
        } finally {
            inflight = undefined;
        }

        return cached ?? emptyPayload();
    })();

    return inflight;
}

export function setCachedPluginGrants(payload: PluginGrantsPayload) {
    cached = { version: 1, grants: payload.grants ?? {} };
    return cached;
}

export async function setPluginPermissionGrant(
    pluginId: string,
    permission: GrantablePluginPermission,
    granted: boolean,
) {
    const current = getPluginGrantedPermissions(pluginId).filter(
        isGrantablePluginPermission,
    );
    const next = granted
        ? Array.from(new Set([...current, permission]))
        : current.filter((candidate) => candidate !== permission);

    const payload = await persistPluginGrant(pluginId, next);

    return setCachedPluginGrants({ version: 1, grants: payload.grants ?? {} });
}

export function resetPluginGrantCache() {
    cached = undefined;
    inflight = undefined;
}
