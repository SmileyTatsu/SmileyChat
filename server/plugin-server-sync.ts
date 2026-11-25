/**
 * Keeps the plugin server modules that are running in step with the plugins
 * that are allowed to run them.
 *
 * The runtime in `plugin-server-runtime.ts` only knows the plugins it was told
 * to start, so something has to own the "should this be running?" question. That
 * is this module: every install, uninstall, enable/disable and grant change ends
 * in `syncPluginServers()`, which compares the desired set with the loaded one
 * and starts/stops the difference.
 *
 * A plugin's server module runs only when all of these hold:
 *
 * 1. it is a user plugin (a local folder or an installed artifact, never core);
 * 2. it is enabled;
 * 3. it is compatible with this app build (no `compatibilityError`);
 * 4. its manifest declares `serverMain` and the `server:process` permission;
 * 5. the user granted `server:process` for it.
 *
 * Nothing here throws: a broken plugin must never break the route that changed
 * a plugin's state.
 */
import { join } from "node:path";

import { CORE_PLUGIN_IDS } from "#frontend/lib/plugins/core-catalog";

import { logger } from "./logger";
import { pluginsDir } from "./paths";
import { pluginHasGrant } from "./plugin-grants";
import { readUserPluginRecords, resolvePluginServerEntry } from "./plugins";
import {
    getPluginServerSignature,
    getPluginServerStatus,
    startPluginServer,
    stopPluginServer,
    type PluginServerStatus,
    type StartPluginServerOptions,
} from "./plugin-server-runtime";

/** What the sync needs to know about one plugin. */
export type PluginServerSyncEntry = {
    id: string;
    /** Missing means enabled, matching the rest of the app. */
    enabled?: boolean;
    version?: string;
    permissions?: string[];
    compatibilityError?: string;
    serverMain?: string;
    /** Folder inside the plugins root; defaults to the plugin id. */
    folderName?: string;
    /** Absolute plugin folder; wins over `folderName`. */
    pluginRoot?: string;
};

export type PluginServerSyncDeps = {
    /** Override discovery (tests, or a caller that already read manifests). */
    readManifests?: () => Promise<PluginServerSyncEntry[]>;
    /** Override the grants lookup. */
    pluginHasGrant?: (pluginId: string, permission: "server:process") => Promise<boolean>;
    /** Override the runtime for tests. */
    start?: (options: StartPluginServerOptions) => Promise<PluginServerStatus>;
    stop?: (pluginId: string) => Promise<void>;
    /** Override the plugins root used for discovery and `serverMain` stats. */
    pluginsRoot?: string;
};

/**
 * Ids this module started.
 *
 * The runtime has no list API on purpose, so this is how a plugin that was
 * removed, disabled or ungranted gets stopped: it was started here, so it is
 * remembered here until it is stopped again.
 */
const startedIds = new Set<string>();

/** Serializes runs so two overlapping routes cannot interleave start/stop. */
let chain: Promise<void> = Promise.resolve();

export function syncPluginServers(deps: PluginServerSyncDeps = {}): Promise<void> {
    const run = chain.then(
        () => runSync(deps),
        () => runSync(deps),
    );

    chain = run.then(
        () => undefined,
        () => undefined,
    );

    return run;
}

async function runSync(deps: PluginServerSyncDeps) {
    const pluginsRoot = deps.pluginsRoot ?? pluginsDir;
    const readManifests =
        deps.readManifests ??
        (async () => {
            const records = await readUserPluginRecords(pluginsRoot);

            return records.map(
                ({ folderName, pluginRoot, manifest, compatibilityError }) => ({
                    id: manifest.id,
                    enabled: manifest.enabled,
                    version: manifest.version,
                    permissions: manifest.permissions,
                    compatibilityError,
                    serverMain: manifest.serverMain,
                    folderName,
                    pluginRoot,
                }),
            );
        });
    const hasGrant =
        deps.pluginHasGrant ??
        ((pluginId, permission) => pluginHasGrant(pluginId, permission));
    const start = deps.start ?? startPluginServer;
    const stop = deps.stop ?? stopPluginServer;

    let entries: PluginServerSyncEntry[];

    try {
        entries = await readManifests();
    } catch (error) {
        logger.error("plugins", "Could not read plugins to sync their servers", {
            error: errorMessage(error),
        });
        return;
    }

    const desired = new Map<string, StartPluginServerOptions>();

    for (const entry of entries) {
        try {
            const wanted = await desiredServer(entry, pluginsRoot, hasGrant);

            if (wanted) {
                desired.set(entry.id, wanted);
            }
        } catch (error) {
            logger.error(
                "plugins",
                `Could not work out whether plugin ${entry.id} should run its server module`,
                { error: errorMessage(error) },
            );
        }
    }

    for (const [pluginId, options] of desired) {
        const signature = getPluginServerSignature(pluginId);
        const status = getPluginServerStatus(pluginId);

        // Same files, already running (or already failed on them): leave it
        // alone. A failed start with an unchanged signature is not retried on
        // every sync; a stop or a toggle clears the signature.
        if (
            signature === options.signature &&
            (status.state === "running" || status.state === "error")
        ) {
            continue;
        }

        startedIds.add(pluginId);

        try {
            await start(options);
        } catch (error) {
            logger.error("plugins", `Could not start the server module of ${pluginId}`, {
                error: errorMessage(error),
            });
        }
    }

    for (const pluginId of [...startedIds]) {
        if (desired.has(pluginId)) {
            continue;
        }

        startedIds.delete(pluginId);

        try {
            await stop(pluginId);
        } catch (error) {
            logger.error("plugins", `Could not stop the server module of ${pluginId}`, {
                error: errorMessage(error),
            });
        }
    }
}

async function desiredServer(
    entry: PluginServerSyncEntry,
    pluginsRoot: string,
    hasGrant: (pluginId: string, permission: "server:process") => Promise<boolean>,
): Promise<StartPluginServerOptions | undefined> {
    if (!entry.serverMain || CORE_PLUGIN_IDS.has(entry.id)) {
        return undefined;
    }

    if (entry.enabled === false || entry.compatibilityError) {
        return undefined;
    }

    if (!(entry.permissions ?? []).includes("server:process")) {
        return undefined;
    }

    if (!(await hasGrant(entry.id, "server:process"))) {
        return undefined;
    }

    const pluginRoot =
        entry.pluginRoot ?? join(pluginsRoot, entry.folderName ?? entry.id);
    const resolved = await resolvePluginServerEntry(pluginRoot, entry.serverMain);

    if (!resolved.ok) {
        // Discovery reports this as `serverStatus.error` and drops `serverMain`;
        // a caller that skipped discovery still must not run it.
        logger.warn("plugins", `Plugin ${entry.id} cannot run its server module`, {
            error: resolved.error,
        });
        return undefined;
    }

    return {
        pluginId: entry.id,
        pluginRoot,
        serverMain: resolved.serverMain,
        signature: `${entry.version ?? "0.0.0"}:${resolved.mtimeMs}:${resolved.size}`,
    };
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
