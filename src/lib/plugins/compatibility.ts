/**
 * Plugin compatibility contract.
 *
 * A plugin manifest can declare:
 *
 * - `apiVersion`: the version of the plugin API contract it was built against.
 *   Missing means the original contract (1), so manifests written before this
 *   field existed keep loading.
 * - `minAppVersion`: the oldest SmileyChat release that can run it.
 *
 * The same check runs in three places so the answer never disagrees:
 * the installer (rejects the ZIP before touching an existing plugin folder),
 * the runtime loader (refuses to activate an incompatible local folder), and
 * the Extension Store (disables Install with the reason).
 */

import type { PluginManifest } from "./types";
import { PLUGIN_API_VERSION } from "./types";
import { compareVersions, isValidVersion } from "./version";

export { PLUGIN_API_VERSION };

/** Raw manifest values; validated here so a malformed field reports a reason. */
export type PluginCompatibilityInput = {
    id: string;
    name?: string;
    source?: PluginManifest["source"];
    apiVersion?: unknown;
    minAppVersion?: unknown;
};

export type PluginCompatibility =
    | { compatible: true }
    | { compatible: false; reason: string };

export function checkPluginCompatibility(
    plugin: PluginCompatibilityInput,
    appVersion: string,
): PluginCompatibility {
    // Bundled core extensions ship with this build, so they always match it.
    if (plugin.source === "core") {
        return { compatible: true };
    }

    const label = plugin.name?.trim() || plugin.id;
    const apiVersion = plugin.apiVersion;

    if (apiVersion !== undefined) {
        if (
            typeof apiVersion !== "number" ||
            !Number.isSafeInteger(apiVersion) ||
            apiVersion < 1
        ) {
            return {
                compatible: false,
                reason: `${label} declares an invalid apiVersion. Use a whole number of 1 or higher.`,
            };
        }

        if (apiVersion > PLUGIN_API_VERSION) {
            return {
                compatible: false,
                reason: `${label} targets plugin API ${apiVersion}, but this SmileyChat build exposes plugin API ${PLUGIN_API_VERSION}. Update SmileyChat to run it.`,
            };
        }
    }

    const minAppVersion = plugin.minAppVersion;

    if (minAppVersion !== undefined) {
        if (typeof minAppVersion !== "string" || !isValidVersion(minAppVersion)) {
            return {
                compatible: false,
                reason: `${label} declares an invalid minAppVersion. Use a version such as 1.2.0.`,
            };
        }

        if (compareVersions(appVersion, minAppVersion) < 0) {
            return {
                compatible: false,
                reason: `${label} needs SmileyChat ${minAppVersion} or newer. This is SmileyChat ${appVersion}.`,
            };
        }
    }

    return { compatible: true };
}

/**
 * Convenience wrapper for UI and loaders that only need the failure message.
 * Returns `undefined` when the manifest can run.
 */
export function pluginCompatibilityError(
    plugin: PluginCompatibilityInput,
    appVersion: string,
): string | undefined {
    const result = checkPluginCompatibility(plugin, appVersion);

    return result.compatible ? undefined : result.reason;
}
