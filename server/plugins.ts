import AdmZip from "adm-zip";
import { Glob } from "bun";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import {
    basename,
    dirname,
    extname,
    isAbsolute,
    join,
    normalize,
    relative,
    resolve,
} from "node:path";

import {
    PLUGIN_CATEGORIES,
    type PluginCategory,
    type PluginManifest,
} from "#frontend/lib/plugins/types";

import {
    getPluginRegistryAllowedHostnames,
    getPluginRegistryUrl,
    isPluginsOutboundFetchAllowed,
} from "./config/runtime-config";
import { BadRequestError, HttpError, json, writeJsonAtomic } from "./http";
import { coreExtensionsDataDir, pluginsDir } from "./paths";
import { safeFetch } from "./security/safe-fetch";

const corePluginIds = new Set(["smiley-chat-formatter", "lorebooks"]);
const PLUGIN_INSTALL_MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const PLUGIN_INSTALL_MAX_EXTRACTED_FILE_BYTES = 10 * 1024 * 1024;
const PLUGIN_INSTALL_MAX_EXTRACTED_TOTAL_BYTES = 50 * 1024 * 1024;
const PLUGIN_INSTALL_MAX_ARCHIVE_ENTRIES = 1000;
const PLUGIN_REGISTRY_MAX_BYTES = 2 * 1024 * 1024;
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

type RegistryPluginStatus = "official" | "verified";

type RegistryPlugin = {
    id: string;
    name: string;
    description?: string;
    version: string;
    author?: string;
    category: PluginCategory;
    status: RegistryPluginStatus;
    archive: { url: string; sha256: string };
};

type PluginRegistry = {
    version: 1;
    plugins: RegistryPlugin[];
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

export async function readPluginRegistry() {
    const registryUrl = getPluginRegistryUrl();
    const registryAllowedHostnames = getPluginRegistryAllowedHostnames();
    const response = await safeFetch(registryUrl, {
        maxResponseBytes: PLUGIN_REGISTRY_MAX_BYTES,
        policy: {
            allowedHostnames: registryAllowedHostnames,
            allowedProtocols: ["https:"],
        },
    });

    if (!response.ok) {
        throw new HttpError(
            502,
            `Plugin registry fetch failed: ${response.status} ${response.statusText}`,
        );
    }

    const bytes = await readResponseBytes(
        response,
        PLUGIN_REGISTRY_MAX_BYTES,
        registryUrl,
    );

    try {
        return json(normalizePluginRegistry(JSON.parse(new TextDecoder().decode(bytes))));
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(502, "Plugin registry returned invalid JSON.");
    }
}

export async function installVerifiedPlugin(body: unknown) {
    if (!body || typeof body !== "object") {
        throw new BadRequestError("Invalid plugin install request.");
    }

    const pluginId = stringField(
        (body as Record<string, unknown>).pluginId,
        "Plugin ID is required.",
    );
    const registryUrl = getPluginRegistryUrl();
    const registryAllowedHostnames = getPluginRegistryAllowedHostnames();
    const registryResponse = await safeFetch(registryUrl, {
        maxResponseBytes: PLUGIN_REGISTRY_MAX_BYTES,
        policy: {
            allowedHostnames: registryAllowedHostnames,
            allowedProtocols: ["https:"],
        },
    });

    if (!registryResponse.ok) {
        throw new HttpError(
            502,
            `Plugin registry fetch failed: ${registryResponse.status} ${registryResponse.statusText}`,
        );
    }

    const registryBytes = await readResponseBytes(
        registryResponse,
        PLUGIN_REGISTRY_MAX_BYTES,
        registryUrl,
    );
    let registry: PluginRegistry;
    try {
        registry = normalizePluginRegistry(
            JSON.parse(new TextDecoder().decode(registryBytes)),
        );
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(502, "Plugin registry returned invalid JSON.");
    }
    const registryPlugin = registry.plugins.find((plugin) => plugin.id === pluginId);

    if (!registryPlugin) {
        throw new BadRequestError("Plugin is not listed in the verified registry.");
    }

    if (corePluginIds.has(registryPlugin.id)) {
        throw new BadRequestError("Registry plugin ID collides with a core extension.");
    }

    const installRoot = join(pluginsDir, ".installing");
    const tempRoot = join(installRoot, `${registryPlugin.id}-${Date.now()}`);
    const backupRoot = join(installRoot, `${registryPlugin.id}-${Date.now()}-previous`);
    const finalRoot = join(pluginsDir, registryPlugin.id);
    let backupCreated = false;
    let finalSwapped = false;

    await mkdir(tempRoot, { recursive: true });

    try {
        const archive = await downloadRegistryArchive(
            registryPlugin.archive,
            registryAllowedHostnames,
        );
        await extractPluginArchive(archive.bytes, tempRoot);
        await hoistSingleArchiveRoot(tempRoot);

        const manifestFile = Bun.file(join(tempRoot, "plugin.json"));

        if (!(await manifestFile.exists())) {
            throw new BadRequestError("Plugin install payload is missing plugin.json.");
        }

        const manifest = normalizePluginManifest(
            await manifestFile.json(),
            registryPlugin.id,
        );

        if (!manifest) {
            throw new BadRequestError("Downloaded plugin manifest is invalid.");
        }

        if (manifest.id !== registryPlugin.id) {
            throw new BadRequestError(
                "Downloaded plugin manifest ID does not match registry ID.",
            );
        }

        if (corePluginIds.has(manifest.id)) {
            throw new BadRequestError(
                "Plugin manifest ID collides with a core extension.",
            );
        }

        await assertInstalledManifestFilesExist(tempRoot, manifest);
        if (await pathExists(finalRoot)) {
            await rename(finalRoot, backupRoot);
            backupCreated = true;
            await preserveExistingPluginData(backupRoot, tempRoot);
        }
        await rename(tempRoot, finalRoot);
        finalSwapped = true;

        const plugins = await readPluginManifests();
        const plugin = plugins.find((item) => item.id === registryPlugin.id);

        if (!plugin) {
            throw new HttpError(500, "Plugin installed but could not be discovered.");
        }

        if (backupCreated) {
            await rm(backupRoot, { recursive: true, force: true });
        }

        return json({ ok: true, plugin, plugins });
    } catch (error) {
        await rm(tempRoot, { recursive: true, force: true });
        if (backupCreated && !finalSwapped && !(await pathExists(finalRoot))) {
            await rename(backupRoot, finalRoot).catch(() => undefined);
        }
        throw error;
    }
}

function normalizePluginRegistry(value: unknown): PluginRegistry {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(502, "Plugin registry must be an object.");
    }

    const registry = value as Record<string, unknown>;

    if (registry.version !== 1) {
        throw new HttpError(502, "Unsupported plugin registry version.");
    }

    if (!Array.isArray(registry.plugins)) {
        throw new HttpError(502, "Plugin registry plugins must be an array.");
    }

    return {
        version: 1,
        plugins: registry.plugins.map(normalizeRegistryPlugin),
    };
}

function normalizeRegistryPlugin(value: unknown): RegistryPlugin {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(502, "Plugin registry entry must be an object.");
    }

    const plugin = value as Record<string, unknown>;
    const id = registryString(plugin.id, "Registry plugin ID is required.");

    if (id !== safeSegment(id)) {
        throw new HttpError(502, `Registry plugin ID '${id}' is not a safe folder name.`);
    }

    const archive = normalizeRegistryArchive(plugin.archive, id);

    const status = plugin.status;

    if (status !== "official" && status !== "verified") {
        throw new HttpError(502, `Registry plugin '${id}' has an invalid status.`);
    }

    return {
        id,
        name: registryString(plugin.name, `Registry plugin '${id}' needs a name.`),
        description:
            typeof plugin.description === "string" ? plugin.description : undefined,
        version: registryString(
            plugin.version,
            `Registry plugin '${id}' needs a version.`,
        ),
        author: typeof plugin.author === "string" ? plugin.author : undefined,
        category: normalizeCategory(plugin.category),
        status,
        archive,
    };
}

function normalizeRegistryArchive(value: unknown, pluginId: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(502, `Registry plugin '${pluginId}' needs an archive.`);
    }

    const archive = value as Record<string, unknown>;
    const url = registryString(
        archive.url,
        `Registry plugin '${pluginId}' archive needs a URL.`,
    );
    const sha256 = registryString(
        archive.sha256,
        `Registry plugin '${pluginId}' archive needs a sha256 hash.`,
    ).toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
        throw new HttpError(
            502,
            `Registry plugin '${pluginId}' archive has an invalid sha256.`,
        );
    }

    return { url, sha256 };
}

function registryString(value: unknown, message: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(502, message);
    }

    return value.trim();
}

async function downloadRegistryArchive(
    archive: { url: string; sha256: string },
    registryAllowedHostnames: string[],
) {
    const parsedUrl = new URL(archive.url);

    if (
        parsedUrl.protocol !== "https:" ||
        !registryAllowedHostnames.includes(parsedUrl.hostname.toLowerCase())
    ) {
        throw new BadRequestError("Registry archive URL host is not trusted.");
    }

    const response = await safeFetch(parsedUrl, {
        maxResponseBytes: PLUGIN_INSTALL_MAX_ARCHIVE_BYTES,
        policy: {
            allowedHostnames: registryAllowedHostnames,
            allowedProtocols: ["https:"],
        },
    });

    if (!response.ok) {
        throw new HttpError(
            502,
            `Plugin archive download failed: ${response.status} ${response.statusText}`,
        );
    }

    const bytes = await readResponseBytesAndHash(
        response,
        PLUGIN_INSTALL_MAX_ARCHIVE_BYTES,
        PLUGIN_INSTALL_MAX_ARCHIVE_BYTES,
        archive.url,
        archive.sha256,
    );

    return { bytes };
}

async function extractPluginArchive(bytes: Uint8Array, tempRoot: string) {
    let zip: AdmZip;

    try {
        zip = new AdmZip(Buffer.from(bytes));
    } catch {
        throw new HttpError(502, "Plugin archive is not a readable ZIP file.");
    }

    const entries = zip.getEntries();

    if (entries.length === 0) {
        throw new BadRequestError("Plugin archive is empty.");
    }

    if (entries.length > PLUGIN_INSTALL_MAX_ARCHIVE_ENTRIES) {
        throw new BadRequestError("Plugin archive contains too many files.");
    }

    let totalExtractedBytes = 0;

    for (const entry of entries) {
        const archivePath = normalizeArchiveEntryName(entry.entryName);

        if (!archivePath || shouldSkipArchiveEntry(archivePath)) {
            continue;
        }

        const targetPath = resolveArchiveEntryPath(tempRoot, archivePath);

        if (entry.isDirectory) {
            await mkdir(targetPath, { recursive: true });
            continue;
        }

        const entrySize = entry.header.size;

        if (entrySize > PLUGIN_INSTALL_MAX_EXTRACTED_FILE_BYTES) {
            throw new BadRequestError(
                `Plugin archive entry '${archivePath}' exceeds 10 MB.`,
            );
        }

        totalExtractedBytes += entrySize;

        if (totalExtractedBytes > PLUGIN_INSTALL_MAX_EXTRACTED_TOTAL_BYTES) {
            throw new BadRequestError("Plugin archive extracted payload exceeds 50 MB.");
        }

        const data = entry.getData();

        if (data.byteLength !== entrySize) {
            throw new BadRequestError(
                `Plugin archive entry '${archivePath}' has an invalid size.`,
            );
        }

        await mkdir(dirname(targetPath), { recursive: true });
        await Bun.write(targetPath, data);
    }
}

function normalizeArchiveEntryName(entryName: string) {
    if (entryName.startsWith("/") || entryName.includes("\\")) {
        throw new HttpError(502, `Plugin archive path '${entryName}' is not allowed.`);
    }

    const normalized = entryName;
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function shouldSkipArchiveEntry(archivePath: string) {
    return (
        archivePath === "__MACOSX" ||
        archivePath.startsWith("__MACOSX/") ||
        archivePath.endsWith("/.DS_Store") ||
        archivePath === ".DS_Store"
    );
}

function resolveArchiveEntryPath(root: string, archivePath: string) {
    validateArchiveEntryPath(archivePath);

    const targetPath = resolve(root, ...archivePath.split("/"));

    if (!isSafeChild(root, targetPath)) {
        throw new HttpError(
            502,
            `Plugin archive path '${archivePath}' escapes install root.`,
        );
    }

    return targetPath;
}

function validateArchiveEntryPath(archivePath: string) {
    if (
        !archivePath ||
        isAbsolute(archivePath) ||
        archivePath.includes("\\") ||
        /^[a-zA-Z]:/.test(archivePath)
    ) {
        throw new HttpError(502, `Plugin archive path '${archivePath}' is not allowed.`);
    }

    const segments = archivePath.split("/");

    if (
        segments.some(
            (segment) =>
                !segment ||
                segment === "." ||
                segment === ".." ||
                /^[a-zA-Z]:/.test(segment),
        )
    ) {
        throw new HttpError(502, `Plugin archive path '${archivePath}' is not allowed.`);
    }
}

async function hoistSingleArchiveRoot(tempRoot: string) {
    if (await pathExists(join(tempRoot, "plugin.json"))) {
        return;
    }

    const entries = await readdir(tempRoot, { withFileTypes: true });
    const contentEntries = entries.filter(
        (entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store",
    );

    if (contentEntries.length !== 1 || !contentEntries[0].isDirectory()) {
        return;
    }

    const nestedRoot = join(tempRoot, contentEntries[0].name);
    const installRoot = dirname(tempRoot);
    const hoistRoot = join(installRoot, `${basename(tempRoot)}-hoist`);

    await rm(hoistRoot, { recursive: true, force: true });
    await rename(nestedRoot, hoistRoot);
    await rm(tempRoot, { recursive: true, force: true });
    await rename(hoistRoot, tempRoot);
}

async function readResponseBytesAndHash(
    response: Response,
    maxFileBytes: number,
    maxRemainingBytes: number,
    url: string,
    expectedSha256: string,
) {
    const reader = response.body?.getReader();

    if (!reader) {
        throw new HttpError(502, `Download from ${url} had no response body.`);
    }

    const hasher = new Bun.CryptoHasher("sha256");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            totalBytes += value.byteLength;

            if (totalBytes > maxFileBytes) {
                await reader.cancel().catch(() => undefined);
                throw new HttpError(
                    502,
                    `Plugin archive from ${url} exceeds ${maxFileBytes} bytes.`,
                );
            }

            if (totalBytes > maxRemainingBytes) {
                await reader.cancel().catch(() => undefined);
                throw new HttpError(502, "Plugin archive download is too large.");
            }

            hasher.update(value);
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const actualSha256 = hasher.digest("hex");

    if (actualSha256 !== expectedSha256.toLowerCase()) {
        throw new HttpError(502, `Plugin archive hash mismatch for ${url}.`);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return bytes;
}

async function assertInstalledManifestFilesExist(
    tempRoot: string,
    manifest: PluginManifest,
) {
    const mainPath = resolve(tempRoot, ...manifest.main.split(/[\\/]/));

    if (!isSafeChild(tempRoot, mainPath)) {
        throw new BadRequestError(
            "Downloaded plugin main file path escapes install root.",
        );
    }

    if (!(await pathExists(mainPath))) {
        throw new BadRequestError("Downloaded plugin main file does not exist.");
    }

    for (const style of manifest.styles ?? []) {
        const stylePath = resolve(tempRoot, ...style.split(/[\\/]/));

        if (!isSafeChild(tempRoot, stylePath)) {
            throw new BadRequestError(
                `Downloaded plugin style file '${style}' escapes install root.`,
            );
        }

        if (!(await pathExists(stylePath))) {
            throw new BadRequestError(
                `Downloaded plugin style file '${style}' does not exist.`,
            );
        }
    }
}

async function preserveExistingPluginData(finalRoot: string, tempRoot: string) {
    const dataPath = join(finalRoot, "data");

    if (!(await pathExists(dataPath))) {
        return;
    }

    const targetDataPath = join(tempRoot, "data");
    await rm(targetDataPath, { recursive: true, force: true });
    await rename(dataPath, targetDataPath);
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

export async function readPluginStorageSnapshot(pluginId: string) {
    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    const folder = pluginDataDir(pluginRecord.folderName, pluginRecord.source);
    const storage: Record<string, unknown> = {};

    try {
        const entries = await readdir(folder);

        for (const entry of entries) {
            if (extname(entry) !== ".json") {
                continue;
            }

            const key = basename(entry, ".json");
            const file = Bun.file(join(folder, entry));

            if (!(await file.exists())) {
                continue;
            }

            try {
                storage[key] = await file.json();
            } catch {
                // skip unreadable entries
            }
        }
    } catch {
        // directory doesn't exist yet — empty snapshot is fine
    }

    return json({ pluginId, storage });
}

export async function writePluginStorageSnapshot(pluginId: string, body: unknown) {
    const pluginRecord = await findPluginById(pluginId);

    if (!pluginRecord) {
        return json({ error: "Plugin not found." }, 404);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ error: "Body must be an object." }, 400);
    }

    const payload = body as Record<string, unknown>;
    const storage =
        payload.storage && typeof payload.storage === "object"
            ? (payload.storage as Record<string, unknown>)
            : payload;

    const folder = pluginDataDir(pluginRecord.folderName, pluginRecord.source);

    await rm(folder, { recursive: true, force: true });
    await mkdir(folder, { recursive: true });

    for (const [key, value] of Object.entries(storage)) {
        try {
            await writeJsonAtomic(
                pluginStoragePath(pluginRecord.folderName, key, pluginRecord.source),
                value,
            );
        } catch (error) {
            console.warn(`Could not restore plugin storage ${pluginId}/${key}:`, error);
        }
    }

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
                error: "Plugin outbound fetch is disabled. Set SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=true in .env to enable it.",
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
        category: normalizeCategory(manifest.category),
    };
}

function normalizeCategory(value: unknown): PluginCategory {
    return typeof value === "string" &&
        (PLUGIN_CATEGORIES as readonly string[]).includes(value)
        ? (value as PluginCategory)
        : "other";
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
        category: corePluginCategories[pluginId] ?? "other",
    };
}

const corePluginCategories: Record<string, PluginCategory> = {
    "smiley-chat-formatter": "interface",
    lorebooks: "memory-lore",
};

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

async function pathExists(pathname: string) {
    try {
        await stat(pathname);
        return true;
    } catch {
        return false;
    }
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
    const method = (
        typeof request.method === "string" && request.method.trim()
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

export const pluginInstallTestInternals = {
    extractPluginArchive,
    hoistSingleArchiveRoot,
    normalizePluginRegistry,
    resolveArchiveEntryPath,
};
