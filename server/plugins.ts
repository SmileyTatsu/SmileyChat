import { Glob } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path";

import type { PluginManifest } from "#frontend/lib/plugins/types";

import { BadRequestError, json, writeJsonAtomic } from "./http";
import { coreExtensionsDataDir, pluginsDir } from "./paths";

const corePluginIds = new Set(["scylla-chat-formatter"]);
const legacyCorePluginFolders: Record<string, string[]> = {
    "scylla-chat-formatter": ["chat-formatter", "scylla-chat-formatter"],
};

export async function readPluginManifests(): Promise<PluginManifest[]> {
    const coreManifests = await readCorePluginManifests();
    await mkdir(pluginsDir, { recursive: true });

    const manifests: PluginManifest[] = [...coreManifests];
    const glob = new Glob("*/plugin.json");

    for await (const manifestFile of glob.scan(pluginsDir)) {
        const folderName = dirname(manifestFile);
        const manifestPath = join(pluginsDir, manifestFile);
        const file = Bun.file(manifestPath);

        if (!(await file.exists())) {
            continue;
        }

        try {
            const manifest = normalizePluginManifest(await file.json(), folderName);

            if (!manifest) {
                continue;
            }

            manifests.push({
                ...manifest,
                source: "user",
                entryUrl: `/plugins/${encodeURIComponent(folderName)}/${encodePath(manifest.main)}`,
                styleUrls: (manifest.styles ?? []).map(
                    (style) =>
                        `/plugins/${encodeURIComponent(folderName)}/${encodePath(style)}`,
                ),
            });
        } catch (error) {
            console.warn(`Could not load plugin manifest ${manifestPath}:`, error);
        }
    }

    return manifests;
}

export async function updatePluginEnabled(pluginId: string, enabled: unknown) {
    if (typeof enabled !== "boolean") {
        return json({ error: "Plugin enabled must be a boolean." }, 400);
    }

    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    if (pluginRecord.source === "core") {
        const plugin = await writeCorePluginEnabled(pluginId, enabled);

        return json({
            ok: true,
            plugin,
            plugins: await readPluginManifests(),
        });
    }

    const file = Bun.file(pluginRecord.manifestPath);
    const manifest = (await file.json()) as Record<string, unknown>;
    const nextManifest = {
        ...manifest,
        enabled,
    };

    await writeJsonAtomic(pluginRecord.manifestPath, nextManifest);

    return json({
        ok: true,
        plugin: normalizePluginManifest(nextManifest, pluginRecord.folderName),
        plugins: await readPluginManifests(),
    });
}

export async function servePluginAsset(url: URL) {
    const parts = decodePathParts(url.pathname);

    if (!parts || parts.length < 2) {
        return new Response("Not found", { status: 404 });
    }

    const [pluginFolder, ...assetParts] = parts;
    const pluginRoot = normalize(join(pluginsDir, pluginFolder));
    const requestedPath = normalize(join(pluginRoot, ...assetParts));

    if (!isSafeChild(pluginRoot, requestedPath)) {
        return new Response("Not found", { status: 404 });
    }

    const file = Bun.file(requestedPath);

    if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(file);
}

export async function readPluginStorage(pluginId: string, key: string) {
    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    const path = pluginStoragePath(pluginRecord.folderName, key, pluginRecord.source);
    const file = Bun.file(path);

    if (await file.exists()) {
        return new Response(file);
    }

    if (pluginRecord.source === "core") {
        for (const legacyPath of legacyCorePluginStoragePaths(pluginId, key)) {
            const legacyFile = Bun.file(legacyPath);

            if (await legacyFile.exists()) {
                return new Response(legacyFile);
            }
        }
    }

    return json({ error: "Plugin storage key not found." }, 404);
}

export async function writePluginStorage(pluginId: string, key: string, value: unknown) {
    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    const folder = pluginDataDir(pluginRecord.folderName, pluginRecord.source);
    await mkdir(folder, { recursive: true });
    await writeJsonAtomic(
        pluginStoragePath(pluginRecord.folderName, key, pluginRecord.source),
        value,
    );
    return json({ ok: true });
}

export async function deletePluginStorage(pluginId: string, key: string) {
    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    await rm(pluginStoragePath(pluginRecord.folderName, key, pluginRecord.source), {
        force: true,
    });
    return json({ ok: true });
}

async function findPluginById(pluginId: string) {
    if (corePluginIds.has(pluginId)) {
        return {
            folderName: safeSegment(pluginId),
            manifestPath: "",
            source: "core" as const,
        };
    }

    await mkdir(pluginsDir, { recursive: true });

    const glob = new Glob("*/plugin.json");

    for await (const manifestFile of glob.scan(pluginsDir)) {
        const folderName = dirname(manifestFile);
        const manifestPath = join(pluginsDir, manifestFile);
        const file = Bun.file(manifestPath);

        if (!(await file.exists())) {
            continue;
        }

        try {
            const manifest = normalizePluginManifest(await file.json(), folderName);

            if (manifest?.id === pluginId) {
                return {
                    folderName,
                    manifestPath,
                    source: "user" as const,
                };
            }
        } catch {
            // Invalid manifests are ignored by discovery and cannot be updated by id.
        }
    }

    return undefined;
}

function normalizePluginManifest(
    value: unknown,
    folderName: string,
): PluginManifest | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const manifest = value as Record<string, unknown>;
    const id = stringOrFallback(manifest.id, folderName);
    const name = stringOrFallback(manifest.name, id);
    const version = stringOrFallback(manifest.version, "0.0.0");
    const main = stringOrFallback(manifest.main, "dist/index.js");
    const styles = Array.isArray(manifest.styles)
        ? manifest.styles.filter((style): style is string => typeof style === "string")
        : [];
    const permissions = Array.isArray(manifest.permissions)
        ? manifest.permissions.filter(
              (permission): permission is string => typeof permission === "string",
          )
        : [];

    return {
        id,
        name,
        version,
        description:
            typeof manifest.description === "string" ? manifest.description : undefined,
        main,
        styles,
        permissions,
        enabled: manifest.enabled !== false,
    };
}

async function readCorePluginManifests() {
    const manifests: PluginManifest[] = [];

    for (const pluginId of corePluginIds) {
        manifests.push(await readCorePluginManifest(pluginId));
    }

    return manifests;
}

async function readCorePluginManifest(pluginId: string): Promise<PluginManifest> {
    const state = await readCorePluginState(pluginId);

    return {
        id: pluginId,
        name: pluginId,
        version: "0.0.0",
        main: "",
        enabled: state.enabled,
        source: "core",
    };
}

async function readCorePluginState(pluginId: string) {
    const file = Bun.file(corePluginEnabledPath(pluginId));

    if (!(await file.exists())) {
        return { enabled: true };
    }

    try {
        const value = (await file.json()) as Record<string, unknown>;
        return {
            enabled: value.enabled !== false,
        };
    } catch {
        return { enabled: true };
    }
}

async function writeCorePluginEnabled(pluginId: string, enabled: boolean) {
    const folder = pluginDataDir(pluginId, "core");
    await mkdir(folder, { recursive: true });
    await writeJsonAtomic(corePluginEnabledPath(pluginId), {
        version: 1,
        enabled,
    });

    return readCorePluginManifest(pluginId);
}

function pluginDataDir(folderName: string, source: "core" | "user" = "user") {
    if (source === "core") {
        return join(coreExtensionsDataDir, safeSegment(folderName));
    }

    return join(pluginsDir, safeSegment(folderName), "data");
}

function corePluginEnabledPath(pluginId: string) {
    return pluginStoragePath(pluginId, "enabled", "core");
}

function pluginStoragePath(
    folderName: string,
    key: string,
    source: "core" | "user" = "user",
) {
    const dataDir = pluginDataDir(folderName, source);
    const requestedPath = normalize(join(dataDir, `${safeSegment(key)}.json`));

    if (!isSafeChild(dataDir, requestedPath)) {
        throw new BadRequestError("Invalid plugin storage key.");
    }

    return requestedPath;
}

function legacyCorePluginStoragePaths(pluginId: string, key: string) {
    return (legacyCorePluginFolders[pluginId] ?? []).map((folderName) =>
        pluginStoragePath(folderName, key, "user"),
    );
}

function decodePathParts(pathname: string) {
    const prefix = "/plugins/";

    if (!pathname.startsWith(prefix)) {
        return undefined;
    }

    return pathname
        .slice(prefix.length)
        .split("/")
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
}

function isSafeChild(parent: string, child: string) {
    const relativePath = relative(normalize(parent), normalize(child));
    return (
        Boolean(relativePath) &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath)
    );
}

function encodePath(path: string) {
    return path.split("/").map(encodeURIComponent).join("/");
}

function safeSegment(value: string) {
    return basename(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function stringOrFallback(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value : fallback;
}
