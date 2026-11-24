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

export type PluginPermissionGrant = {
    permissions: string[];
    grantedAt: string;
};

export type PluginGrantsPayload = {
    version: 1;
    grants: Record<string, PluginPermissionGrant>;
};

/**
 * Mirror of `GRANTABLE_PLUGIN_PERMISSIONS` on the server.
 *
 * Kept as a literal here because the plugin UI must not import server modules
 * at runtime; the server refuses anything outside its own list, so a drift can
 * only ever narrow what the UI offers.
 */
export const GRANTABLE_PLUGIN_PERMISSIONS = ["connections:secrets"] as const;

export type GrantablePluginPermission = (typeof GRANTABLE_PLUGIN_PERMISSIONS)[number];

export function isGrantablePluginPermission(
    permission: string,
): permission is GrantablePluginPermission {
    return (GRANTABLE_PLUGIN_PERMISSIONS as readonly string[]).includes(permission);
}

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
