import { readdir, rmdir, rm, stat } from "node:fs/promises";
import { join, normalize } from "node:path";

import { CORE_PLUGIN_IDS } from "#frontend/lib/plugins/core-catalog";

import { BadRequestError, HttpError, NotFoundError, json } from "./http";
import { logger } from "./logger";
import { pluginsDir } from "./paths";
import { stopPluginServer } from "./plugin-server-runtime";
import {
    isSafeChild,
    readPluginInstallMetadata,
    readPluginManifests,
    safeSegment,
} from "./plugins";

export type UninstallPluginOptions = {
    /** Remove the plugin's `data/` folder as well as its code. */
    deleteData?: boolean;
    /** Override the plugins root for tests. */
    pluginsRoot?: string;
};

/**
 * Removes a plugin that SmileyChat installed. Local development folders are
 * never touched: they have no install metadata and belong to the user.
 *
 * `plugin.json` and `smileychat-install.json` are deleted first so a partial
 * failure (for example a Windows file lock) can never leave a half-removed
 * plugin that discovery would still load.
 */
export async function uninstallPlugin(
    pluginId: string,
    options: UninstallPluginOptions = {},
) {
    const pluginsRoot = options.pluginsRoot ?? pluginsDir;
    const deleteData = options.deleteData === true;

    if (CORE_PLUGIN_IDS.has(pluginId)) {
        throw new BadRequestError("Core extensions cannot be uninstalled.");
    }

    if (
        !pluginId ||
        pluginId === "." ||
        pluginId === ".." ||
        pluginId !== safeSegment(pluginId)
    ) {
        throw new BadRequestError("Plugin ID is not a safe folder name.");
    }

    const pluginRoot = normalize(join(pluginsRoot, pluginId));

    if (!isSafeChild(pluginsRoot, pluginRoot)) {
        throw new BadRequestError("Plugin ID is not a safe folder name.");
    }

    if (!(await pathExists(pluginRoot))) {
        throw new NotFoundError("Plugin not found.");
    }

    const metadata = await readPluginInstallMetadata(pluginRoot);

    if (!metadata) {
        throw new BadRequestError(
            "Only plugins installed by SmileyChat can be uninstalled. Local plugin folders must be removed manually.",
        );
    }

    // A live server module (or a child process it spawned) keeps handles inside
    // the folder; on Windows that turns the delete below into EPERM. Stop it and
    // release its module copy before anything is removed.
    await stopPluginServer(pluginId);

    // Stop discovery before touching anything else. A failure later can leave
    // files behind, but never a plugin the app still lists or loads.
    await removeEntry(join(pluginRoot, "plugin.json"), false);
    await removeEntry(join(pluginRoot, "smileychat-install.json"), false);

    const entries = await readdir(pluginRoot).catch(() => [] as string[]);
    const failedEntries: string[] = [];

    for (const entry of entries) {
        if (!deleteData && entry === "data") {
            continue;
        }

        try {
            await removeEntry(join(pluginRoot, entry), true);
        } catch (error) {
            failedEntries.push(entry);
            logger.warn("plugins", `Could not remove plugin file ${pluginId}/${entry}`, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (deleteData) {
        try {
            await removeEntry(pluginRoot, true);
        } catch (error) {
            logger.warn("plugins", `Could not remove plugin folder ${pluginId}`, {
                error: error instanceof Error ? error.message : String(error),
            });
            throw new HttpError(
                500,
                "Plugin was uninstalled, but some files could not be deleted. Remove the plugin folder manually.",
            );
        }
    } else {
        // Keep a `data/` folder for a future reinstall, but do not leave an
        // empty shell behind when the plugin never stored anything.
        await rmdir(pluginRoot).catch(() => undefined);
    }

    if (failedEntries.length > 0) {
        throw new HttpError(
            500,
            "Plugin was uninstalled, but some files could not be deleted. Remove the plugin folder manually.",
        );
    }

    logger.info("plugins", `Uninstalled plugin ${pluginId}`, {
        deleteData,
        source: metadata.source,
    });

    return json({
        ok: true,
        pluginId,
        deleteData,
        plugins: await readPluginManifests(),
    });
}

const REMOVE_RETRY_OPTIONS = {
    force: true,
    maxRetries: 5,
    retryDelay: 100,
} as const;

async function removeEntry(pathname: string, recursive: boolean) {
    try {
        await rm(pathname, {
            ...REMOVE_RETRY_OPTIONS,
            recursive,
        });
    } catch (error) {
        if (isMissingPathError(error)) {
            return;
        }

        throw error;
    }
}

function isMissingPathError(error: unknown) {
    return (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
    );
}

async function pathExists(pathname: string) {
    try {
        await stat(pathname);
        return true;
    } catch {
        return false;
    }
}
