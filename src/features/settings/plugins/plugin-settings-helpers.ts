import {
    ArrowLeftRight,
    BookOpen,
    Bot,
    Boxes,
    Layout,
    Plug,
    Wrench,
} from "lucide-preact";
import type { FunctionComponent } from "preact";

import { APP_VERSION } from "#frontend/lib/app-version";
import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { pluginCompatibilityError } from "#frontend/lib/plugins/compatibility";
import { BUILT_IN_PROFILES, type PluginProfile } from "#frontend/lib/plugins/profiles";
import type {
    PluginCategory,
    PluginManifest,
    PluginServerStatus,
} from "#frontend/lib/plugins/types";
import { isNewerVersion } from "#frontend/lib/plugins/version";
export { pluginIdFromScopedId } from "#frontend/lib/plugins/ids";

export type RequestState = "idle" | "loading" | "success" | "error";
export type InstalledFilter = "all" | "installed" | "not-installed";
export type PluginsView = "local" | "store";

export const CATEGORY_ICONS: Record<
    PluginCategory,
    FunctionComponent<{ size?: number | string }>
> = {
    interface: Layout,
    "input-output": ArrowLeftRight,
    automation: Bot,
    connections: Plug,
    tools: Wrench,
    "memory-lore": BookOpen,
    other: Boxes,
};

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

export function nextProfileName(baseName: string, profiles: PluginProfile[]) {
    const names = new Set(profiles.map((profile) => profile.name));

    if (!names.has(baseName)) {
        return baseName;
    }

    for (let index = 2; index < 1000; index += 1) {
        const name = `${baseName} ${index}`;

        if (!names.has(name)) {
            return name;
        }
    }

    return `${baseName} ${Date.now()}`;
}

export function uniqueProfileId(name: string, profiles: PluginProfile[]) {
    const ids = new Set(profiles.map((profile) => profile.id));
    const baseId = slugify(name) || `profile-${Date.now()}`;
    const isReserved = (id: string) =>
        ids.has(id) || BUILT_IN_PROFILES.some((profile) => profile.id === id);

    if (!isReserved(baseId)) {
        return baseId;
    }

    for (let index = 2; index < 1000; index += 1) {
        const id = `${baseId}-${index}`;

        if (!isReserved(id)) {
            return id;
        }
    }

    return `${baseId}-${Date.now()}`;
}

export type StoreEntryState = {
    installed: boolean;
    canUpdate: boolean;
    upToDate: boolean;
    installedLocally: boolean;
    incompatible: boolean;
    incompatibility: string | undefined;
};

/**
 * How a registry entry relates to this install. The Store list and the Store
 * detail card both read this so a row never says "Installed" above a card that
 * offers "Install", and updating is only offered for copies SmileyChat manages.
 */
export function storeEntryState(
    entry: PluginRegistryEntry,
    installedPlugin?: PluginManifest,
): StoreEntryState {
    const incompatibility = pluginCompatibilityError(entry, APP_VERSION);
    const installed = Boolean(installedPlugin);
    const managesInstalledCopy = installedPlugin?.install !== undefined;
    const canUpdate = Boolean(
        installedPlugin &&
        managesInstalledCopy &&
        !incompatibility &&
        isNewerVersion(entry.version, installedPlugin.version),
    );

    return {
        installed,
        canUpdate,
        upToDate:
            installedPlugin?.install?.source === "registry" &&
            !canUpdate &&
            !incompatibility,
        installedLocally: installed && !managesInstalledCopy,
        incompatible: Boolean(incompatibility),
        incompatibility,
    };
}

export type PluginServerStatusTone = "pending" | "running" | "stopped" | "error";

export type PluginServerStatusLine = {
    text: string;
    tone: PluginServerStatusTone;
    /** Secondary muted line, only when the last host request failed. */
    detail?: string;
};

/**
 * One compact line for the optional server part of a plugin.
 *
 * The server fills `serverStatus` on `GET /api/plugins` when the manifest
 * declares `serverMain`. Declaring it is not approval, so the module is
 * reported as waiting until `server:process` is granted; after that the line
 * follows the runtime state the server reported.
 */
export function pluginServerStatusLine(
    plugin: Pick<PluginManifest, "serverMain" | "serverStatus">,
    grantedPermissions: readonly string[],
): PluginServerStatusLine | undefined {
    const declaresServer = Boolean(plugin.serverMain?.trim());
    const status: PluginServerStatus | undefined = plugin.serverStatus;

    if (!declaresServer && !status) {
        return undefined;
    }

    const detail = status?.lastRequestError
        ? `Last request failed: ${status.lastRequestError}`
        : undefined;

    if (declaresServer && !grantedPermissions.includes("server:process")) {
        return {
            text: "Server part waiting for your approval",
            tone: "pending",
            detail,
        };
    }

    if (!status) {
        return undefined;
    }

    if (status.state === "error") {
        return {
            text: status.error?.trim() || "Server part failed to start",
            tone: "error",
            detail,
        };
    }

    if (status.state === "stopped") {
        return { text: "Server part stopped", tone: "stopped", detail };
    }

    return { text: "Server part running", tone: "running", detail };
}
