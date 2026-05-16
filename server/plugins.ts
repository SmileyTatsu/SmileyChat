import { Glob } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path";

import type { PluginManifest } from "#frontend/lib/plugins/types";

import { isPluginsOutboundFetchAllowed } from "./config/runtime-config";
import { BadRequestError, HttpError, json, writeJsonAtomic } from "./http";
import { coreExtensionsDataDir, pluginsDir } from "./paths";
import { safeFetch } from "./security/safe-fetch";

const corePluginIds = new Set(["smiley-chat-formatter"]);
const legacyCorePluginFolders: Record<string, string[]> = {
    "smiley-chat-formatter": ["chat-formatter", "smiley-chat-formatter"],
};
const PLUGIN_FETCH_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const PLUGIN_FETCH_MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const PLUGIN_FETCH_ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const BLOCKED_PLUGIN_FETCH_REQUEST_HEADERS = new Set([
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "proxy-authenticate",
    "proxy-authorization",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
    "set-cookie",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "x-smileychat-csrf",
    "x-smileychat-csrf-magic",
]);
const BLOCKED_PLUGIN_FETCH_RESPONSE_HEADERS = new Set([
    "connection",
    "content-encoding",
    "content-length",
    "set-cookie",
    "transfer-encoding",
]);

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

export async function proxyPluginFetch(body: unknown) {
    if (!isPluginsOutboundFetchAllowed()) {
        return json(
            {
                error:
                    "Plugin outbound fetch is disabled. Set SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true in .env to enable it.",
            },
            403,
        );
    }

    const request = normalizePluginFetchRequest(body);
    const pluginRecord = await findPluginById(request.pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    if (pluginRecord.manifest.enabled === false) {
        return json({ error: "Plugin is disabled." }, 403);
    }

    if (!pluginRecord.manifest.permissions?.includes("network:fetch")) {
        return json(
            { error: `${pluginRecord.manifest.name} needs "network:fetch" permission.` },
            403,
        );
    }

    const upstreamResponse = await safeFetch(request.url, {
        body: request.body,
        headers: request.headers,
        maxResponseBytes: request.maxResponseBytes,
        method: request.method,
        policy: {
            allowedProtocols: ["https:"],
            flagName: "SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH",
        },
    });
    const bytes = await readResponseBytes(
        upstreamResponse,
        request.maxResponseBytes,
        request.url,
    );

    return new Response(bytes, {
        headers: filterResponseHeaders(upstreamResponse.headers),
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
    });
}

async function findPluginById(pluginId: string) {
    if (corePluginIds.has(pluginId)) {
        const manifest = await readCorePluginManifest(pluginId);
        return {
            folderName: safeSegment(pluginId),
            manifest,
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
                    manifest,
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

function normalizePluginFetchRequest(value: unknown) {
    if (!value || typeof value !== "object") {
        throw new BadRequestError("Invalid plugin fetch request.");
    }

    const request = value as Record<string, unknown>;
    const pluginId = stringField(request.pluginId, "Plugin ID is required.");
    const url = stringField(request.url, "URL is required.");
    const method = (typeof request.method === "string" && request.method.trim()
        ? request.method
        : "GET"
    ).toUpperCase();

    if (!PLUGIN_FETCH_ALLOWED_METHODS.has(method)) {
        throw new BadRequestError(`Method ${method} is not allowed for plugin fetch.`);
    }

    const body = typeof request.body === "string" ? request.body : undefined;

    if (body && method === "GET") {
        throw new BadRequestError("GET plugin fetch requests cannot include a body.");
    }

    if (
        body &&
        new TextEncoder().encode(body).byteLength > PLUGIN_FETCH_MAX_REQUEST_BODY_BYTES
    ) {
        throw new BadRequestError("Plugin fetch request body is too large.");
    }

    const maxResponseBytes = normalizeMaxResponseBytes(request.maxResponseBytes);

    return {
        body,
        headers: normalizePluginFetchHeaders(request.headers),
        maxResponseBytes,
        method,
        pluginId,
        url,
    };
}

function stringField(value: unknown, message: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new BadRequestError(message);
    }

    return value.trim();
}

function normalizeMaxResponseBytes(value: unknown) {
    if (value === undefined) {
        return PLUGIN_FETCH_MAX_RESPONSE_BYTES;
    }

    const bytes = Number(value);

    if (
        !Number.isInteger(bytes) ||
        bytes < 1 ||
        bytes > PLUGIN_FETCH_MAX_RESPONSE_BYTES
    ) {
        throw new BadRequestError(
            `maxResponseBytes must be between 1 and ${PLUGIN_FETCH_MAX_RESPONSE_BYTES}.`,
        );
    }

    return bytes;
}

function normalizePluginFetchHeaders(value: unknown) {
    const headers = new Headers();

    if (value === undefined) {
        return headers;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new BadRequestError("Plugin fetch headers must be an object.");
    }

    for (const [name, headerValue] of Object.entries(value)) {
        const normalizedName = name.toLowerCase();

        if (BLOCKED_PLUGIN_FETCH_REQUEST_HEADERS.has(normalizedName)) {
            continue;
        }

        if (typeof headerValue !== "string") {
            throw new BadRequestError("Plugin fetch header values must be strings.");
        }

        headers.set(name, headerValue);
    }

    return headers;
}

function filterResponseHeaders(sourceHeaders: Headers) {
    const headers = new Headers();

    for (const [name, value] of sourceHeaders) {
        if (!BLOCKED_PLUGIN_FETCH_RESPONSE_HEADERS.has(name.toLowerCase())) {
            headers.set(name, value);
        }
    }

    return headers;
}

async function readResponseBytes(
    response: Response,
    maxResponseBytes: number,
    url: string,
) {
    const reader = response.body?.getReader();

    if (!reader) {
        return new Uint8Array();
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            totalBytes += value.byteLength;

            if (totalBytes > maxResponseBytes) {
                await reader.cancel().catch(() => undefined);
                throw new HttpError(
                    502,
                    `Outbound response from ${url} exceeded ${maxResponseBytes} bytes.`,
                );
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return bytes;
}
