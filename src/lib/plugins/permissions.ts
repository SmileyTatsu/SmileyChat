import type { PluginManifest } from "./types";

export function requireDeclaredPluginPermission(
    manifest: PluginManifest,
    permission: string,
) {
    if (manifest.permissions?.includes(permission)) {
        return;
    }

    throw new Error(`${manifest.name} needs "${permission}" permission.`);
}
