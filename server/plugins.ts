import AdmZip from "adm-zip";
import { Glob } from "bun";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
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
    isUnverifiedPluginsAllowed,
    isPluginsOutboundFetchAllowed,
} from "./config/runtime-config";
import { BadRequestError, HttpError, json, writeJsonAtomic } from "./http";
import { coreExtensionsDataDir, pluginsDir } from "./paths";
import { safeFetch } from "./security/safe-fetch";

const corePluginIds = new Set([
    "smiley-chat-formatter",
    "smiley-lorebooks",
    "smiley-chat-summarizer",
    "smiley-post-processing",
    "smiley-mcp",
    "smiley-regex-replacer",
    "workspace-tools",
]);
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
    repository?: string;
    artifact: { url: string };
};

type PluginRegistry = {
    version: 1;
    plugins: RegistryPlugin[];
};

type PluginInstallSource =
    | {
          source: "registry";
          pluginId: string;
          artifactUrl: string;
          repository?: string;
      }
    | {
          source: "manual-artifact";
          artifactUrl: string;
          unverified: true;
      };

type PluginInstallMetadata = PluginInstallSource & {
    installedAt: string;
};

type InstallArtifactOptions = {
    expectedPluginId?: string;
    pluginsRoot?: string;
    source: PluginInstallSource;
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

            const pluginRoot = join(pluginsDir, folderName);
            const cacheKey = await pluginCacheKey(pluginRoot, manifest);

            manifests.push({
                ...manifest,
                source: "user",
                entryUrl: pluginAssetUrl(folderName, manifest.main, cacheKey),
                styleUrls: (manifest.styles ?? []).map((style) =>
                    pluginAssetUrl(folderName, style, cacheKey),
                ),
                install: await readPluginInstallMetadata(pluginRoot),
            } as PluginManifest);
        } catch (error) {
            console.warn(`Could not load plugin manifest ${manifestPath}:`, error);
        }
    }

    return manifests;
}

export async function readPluginRegistry() {
    const registry = await loadPluginRegistry();
    return json({
        ...registry,
        allowManualArtifactInstall: isUnverifiedPluginsAllowed(),
    });
}

async function loadPluginRegistry() {
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
        return normalizePluginRegistry(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(502, "Plugin registry returned invalid JSON.");
    }
}

export async function installVerifiedPlugin(body: unknown) {
    const source = await resolveInstallSource(body);
    const bytes = await downloadArtifact(source.artifactUrl, {
        allowedHostnames:
            source.source === "registry"
                ? getPluginRegistryAllowedHostnames()
                : undefined,
        label: "Plugin artifact",
    });
    return installPluginArtifact(bytes, {
        expectedPluginId: source.source === "registry" ? source.pluginId : undefined,
        source,
    });
}

export async function updateInstalledPlugin(pluginId: string) {
    const safePluginId = safeSegment(pluginId);

    if (safePluginId !== pluginId || corePluginIds.has(pluginId)) {
        throw new BadRequestError("Plugin cannot be updated.");
    }

    const installRoot = join(pluginsDir, pluginId);
    const metadata = await readPluginInstallMetadata(installRoot);

    if (!metadata) {
        throw new BadRequestError("Plugin was not installed by SmileyChat.");
    }

    const source =
        metadata.source === "registry"
            ? await latestRegistryInstallSource(pluginId)
            : ({
                  source: "manual-artifact",
                  artifactUrl: metadata.artifactUrl,
                  unverified: true,
              } satisfies PluginInstallSource);

    if (source.source === "manual-artifact" && !isUnverifiedPluginsAllowed()) {
        throw new BadRequestError(
            "Manual plugin updates are disabled. Set SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true to update this plugin.",
        );
    }

    const bytes = await downloadArtifact(source.artifactUrl, {
        allowedHostnames:
            source.source === "registry"
                ? getPluginRegistryAllowedHostnames()
                : undefined,
        label: "Plugin artifact",
    });

    return installPluginArtifact(bytes, {
        expectedPluginId: pluginId,
        source,
    });
}

async function resolveInstallSource(body: unknown): Promise<PluginInstallSource> {
    if (!body || typeof body !== "object") {
        throw new BadRequestError("Invalid plugin install request.");
    }

    const request = body as Record<string, unknown>;

    if (typeof request.pluginId === "string" && request.pluginId.trim()) {
        return latestRegistryInstallSource(request.pluginId.trim());
    }

    if (typeof request.artifactUrl === "string" && request.artifactUrl.trim()) {
        if (!isUnverifiedPluginsAllowed()) {
            throw new BadRequestError(
                "Manual plugin install is disabled. Set SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS=true to enable unverified artifact installs.",
            );
        }

        const artifactUrl = normalizeHttpsArtifactUrl(request.artifactUrl.trim());
        return { source: "manual-artifact", artifactUrl, unverified: true };
    }

    throw new BadRequestError("Plugin ID or artifact URL is required.");
}

async function latestRegistryInstallSource(
    pluginId: string,
): Promise<PluginInstallSource> {
    const registry = await loadPluginRegistry();
    const registryPlugin = registry.plugins.find((plugin) => plugin.id === pluginId);

    if (!registryPlugin) {
        throw new BadRequestError("Plugin is not listed in the verified registry.");
    }

    if (corePluginIds.has(registryPlugin.id)) {
        throw new BadRequestError("Registry plugin ID collides with a core extension.");
    }

    return {
        source: "registry",
        pluginId: registryPlugin.id,
        artifactUrl: registryPlugin.artifact.url,
        repository: registryPlugin.repository,
    };
}

async function installPluginArtifact(bytes: Uint8Array, options: InstallArtifactOptions) {
    const pluginsRoot = options.pluginsRoot ?? pluginsDir;
    const installRoot = join(pluginsRoot, ".installing");
    const candidateId =
        options.expectedPluginId ?? pluginIdFromArtifactSource(options.source);
    const tempRoot = join(installRoot, `${safeSegment(candidateId)}-${Date.now()}`);
    const backupRoot = join(
        installRoot,
        `${safeSegment(candidateId)}-${Date.now()}-previous`,
    );
    let finalRoot = "";
    let backupCreated = false;
    let finalSwapped = false;

    await mkdir(tempRoot, { recursive: true });

    try {
        await extractPluginArchive(bytes, tempRoot);

        const manifestFile = Bun.file(join(tempRoot, "plugin.json"));

        if (!(await manifestFile.exists())) {
            throw new BadRequestError(
                "Plugin install payload is missing root plugin.json.",
            );
        }

        const manifest = normalizePluginManifest(await manifestFile.json(), "");

        if (!manifest) {
            throw new BadRequestError("Downloaded plugin manifest is invalid.");
        }

        if (
            !manifest.id ||
            manifest.id === "." ||
            manifest.id === ".." ||
            manifest.id !== safeSegment(manifest.id)
        ) {
            throw new BadRequestError(
                "Downloaded plugin manifest ID is missing or is not a safe folder name.",
            );
        }

        if (options.expectedPluginId && manifest.id !== options.expectedPluginId) {
            throw new BadRequestError(
                "Downloaded plugin manifest ID does not match expected ID.",
            );
        }

        if (corePluginIds.has(manifest.id)) {
            throw new BadRequestError(
                "Plugin manifest ID collides with a core extension.",
            );
        }

        await assertInstalledManifestFilesExist(tempRoot, manifest);
        finalRoot = join(pluginsRoot, manifest.id);

        if (await pathExists(finalRoot)) {
            await rename(finalRoot, backupRoot);
            backupCreated = true;
            await preserveExistingPluginData(backupRoot, tempRoot);
        }

        await writePluginInstallMetadata(tempRoot, options.source);
        await rename(tempRoot, finalRoot);
        finalSwapped = true;

        const cacheKey = await pluginCacheKey(finalRoot, manifest);
        const plugin = {
            ...manifest,
            source: "user",
            entryUrl: pluginAssetUrl(manifest.id, manifest.main, cacheKey),
            styleUrls: (manifest.styles ?? []).map((style) =>
                pluginAssetUrl(manifest.id, style, cacheKey),
            ),
            install: await readPluginInstallMetadata(finalRoot),
        };
        const plugins =
            pluginsRoot === pluginsDir
                ? await readPluginManifests()
                : [plugin as PluginManifest];

        if (!plugins.find((item) => item.id === manifest.id)) {
            throw new HttpError(500, "Plugin installed but could not be discovered.");
        }

        if (backupCreated) {
            await rm(backupRoot, { recursive: true, force: true }).catch((error) => {
                console.warn(
                    `Could not remove plugin install backup ${backupRoot}:`,
                    error,
                );
            });
        }

        return json({ ok: true, plugin, plugins });
    } catch (error) {
        await rm(tempRoot, { recursive: true, force: true });
        if (backupCreated && finalRoot) {
            if (finalSwapped) {
                await rm(finalRoot, { recursive: true, force: true }).catch(
                    () => undefined,
                );
            }

            if (!(await pathExists(finalRoot))) {
                await rename(backupRoot, finalRoot).catch(() => undefined);
            }
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

    const artifact = normalizeRegistryArtifact(plugin.artifact, id);

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
        category: normalizeRegistryCategory(plugin.category, id),
        status,
        repository:
            typeof plugin.repository === "string" && plugin.repository.trim()
                ? plugin.repository.trim()
                : undefined,
        artifact,
    };
}

function normalizeRegistryArtifact(value: unknown, pluginId: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(502, `Registry plugin '${pluginId}' needs an artifact.`);
    }

    const artifact = value as Record<string, unknown>;
    const url = registryString(
        artifact.url,
        `Registry plugin '${pluginId}' artifact needs a URL.`,
    );

    try {
        const parsedUrl = new URL(url);

        if (
            parsedUrl.protocol !== "https:" ||
            !parsedUrl.pathname.toLowerCase().endsWith(".zip")
        ) {
            throw new Error("invalid artifact URL");
        }

        return { url: parsedUrl.toString() };
    } catch {
        throw new HttpError(
            502,
            `Registry plugin '${pluginId}' artifact URL must be an HTTPS ZIP URL.`,
        );
    }
}

function registryString(value: unknown, message: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(502, message);
    }

    return value.trim();
}

async function downloadArtifact(
    artifactUrl: string,
    options: { allowedHostnames?: string[]; label: string },
) {
    const parsedUrl = new URL(artifactUrl);
    const response = await safeFetch(parsedUrl, {
        maxResponseBytes: PLUGIN_INSTALL_MAX_ARCHIVE_BYTES,
        policy: {
            allowedHostnames: options.allowedHostnames,
            allowedProtocols: ["https:"],
        },
    });

    if (!response.ok) {
        throw new HttpError(
            502,
            `${options.label} download failed: ${response.status} ${response.statusText}`,
        );
    }

    const bytes = await readResponseBytes(
        response,
        PLUGIN_INSTALL_MAX_ARCHIVE_BYTES,
        artifactUrl,
    );

    return bytes;
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

async function assertInstalledManifestFilesExist(
    tempRoot: string,
    manifest: PluginManifest,
) {
    const mainPath = resolveManifestPath(
        tempRoot,
        manifest.main,
        "Downloaded plugin main file path",
    );

    if (!(await pathExists(mainPath))) {
        throw new BadRequestError("Downloaded plugin main file does not exist.");
    }

    for (const style of manifest.styles ?? []) {
        const stylePath = resolveManifestPath(
            tempRoot,
            style,
            `Downloaded plugin style file '${style}'`,
        );

        if (!(await pathExists(stylePath))) {
            throw new BadRequestError(
                `Downloaded plugin style file '${style}' does not exist.`,
            );
        }
    }
}

function resolveManifestPath(root: string, relativePath: string, label: string) {
    const manifestPath = normalizeManifestRelativePath(relativePath);
    validateManifestRelativePath(manifestPath, label);

    const resolvedPath = resolve(root, ...manifestPath.split("/"));

    if (!isSafeChild(root, resolvedPath)) {
        throw new BadRequestError(`${label} escapes install root.`);
    }

    return resolvedPath;
}

function normalizeManifestRelativePath(relativePath: string) {
    let normalized = relativePath.replace(/\\/g, "/");

    while (normalized.startsWith("./")) {
        normalized = normalized.slice(2);
    }

    return normalized;
}

function validateManifestRelativePath(manifestPath: string, label: string) {
    if (
        !manifestPath ||
        isAbsolute(manifestPath) ||
        manifestPath.includes("\\") ||
        /^[a-zA-Z]:/.test(manifestPath)
    ) {
        throw new BadRequestError(`${label} is not a safe relative path.`);
    }

    const segments = manifestPath.split("/");

    if (
        segments.some(
            (segment) =>
                !segment ||
                segment === "." ||
                segment === ".." ||
                /^[a-zA-Z]:/.test(segment),
        )
    ) {
        throw new BadRequestError(`${label} is not a safe relative path.`);
    }
}

function pluginAssetUrl(folderName: string, relativePath: string, cacheKey: string) {
    const path = normalizeManifestRelativePath(relativePath);
    const query = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : "";

    return `/plugins/${encodeURIComponent(folderName)}/${encodePath(path)}${query}`;
}

async function pluginCacheKey(root: string, manifest: PluginManifest) {
    const installMetadata = await readPluginInstallMetadata(root);

    if (installMetadata?.installedAt) {
        return installMetadata.installedAt;
    }

    const paths = ["plugin.json", manifest.main, ...(manifest.styles ?? [])];
    let newestMtime = 0;

    for (const relativePath of paths) {
        const normalizedPath = normalizeManifestRelativePath(relativePath);
        const candidate = resolve(root, ...normalizedPath.split("/"));

        if (!isSafeChild(root, candidate)) {
            continue;
        }

        try {
            const info = await stat(candidate);
            newestMtime = Math.max(newestMtime, info.mtimeMs);
        } catch {
            // Local dev plugins can be mid-edit. Install validation handles
            // missing packaged assets, so cache busting stays best effort here.
        }
    }

    return newestMtime > 0 ? String(Math.trunc(newestMtime)) : "";
}

async function preserveExistingPluginData(finalRoot: string, tempRoot: string) {
    const dataPath = join(finalRoot, "data");

    if (!(await pathExists(dataPath))) {
        return;
    }

    const targetDataPath = join(tempRoot, "data");
    await rm(targetDataPath, { recursive: true, force: true });
    await cp(dataPath, targetDataPath, { recursive: true });
}

async function readPluginInstallMetadata(
    pluginRoot: string,
): Promise<PluginInstallMetadata | undefined> {
    const file = Bun.file(join(pluginRoot, "smileychat-install.json"));

    if (!(await file.exists())) {
        return undefined;
    }

    try {
        return normalizePluginInstallMetadata(await file.json());
    } catch {
        return undefined;
    }
}

async function writePluginInstallMetadata(
    pluginRoot: string,
    source: PluginInstallSource,
) {
    await writeJsonAtomic(join(pluginRoot, "smileychat-install.json"), {
        ...source,
        installedAt: new Date().toISOString(),
    });
}

function normalizePluginInstallMetadata(
    value: unknown,
): PluginInstallMetadata | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const metadata = value as Record<string, unknown>;
    const installedAt =
        typeof metadata.installedAt === "string"
            ? metadata.installedAt
            : new Date(0).toISOString();

    if (metadata.source === "registry") {
        const pluginId =
            typeof metadata.pluginId === "string" ? metadata.pluginId.trim() : "";
        const artifactUrl =
            typeof metadata.artifactUrl === "string" ? metadata.artifactUrl.trim() : "";

        if (!pluginId || !artifactUrl) {
            return undefined;
        }

        return {
            source: "registry",
            pluginId,
            artifactUrl,
            repository:
                typeof metadata.repository === "string" ? metadata.repository : undefined,
            installedAt,
        };
    }

    if (metadata.source === "manual-artifact") {
        const artifactUrl =
            typeof metadata.artifactUrl === "string" ? metadata.artifactUrl.trim() : "";

        if (!artifactUrl) {
            return undefined;
        }

        return {
            source: "manual-artifact",
            artifactUrl,
            installedAt,
            unverified: true,
        };
    }

    return undefined;
}

function pluginIdFromArtifactSource(source: PluginInstallSource) {
    if (source.source === "registry") {
        return source.pluginId;
    }

    const pathname = new URL(source.artifactUrl).pathname;
    return basename(pathname, ".zip") || "manual-plugin";
}

function normalizeHttpsArtifactUrl(
    value: string,
    message = "Artifact URL must be an HTTPS ZIP URL.",
) {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new BadRequestError(message);
    }

    if (url.protocol !== "https:" || !url.pathname.toLowerCase().endsWith(".zip")) {
        throw new BadRequestError(message);
    }

    return url.toString();
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

function normalizeRegistryCategory(value: unknown, pluginId: string): PluginCategory {
    if (
        typeof value === "string" &&
        (PLUGIN_CATEGORIES as readonly string[]).includes(value)
    ) {
        return value as PluginCategory;
    }

    throw new HttpError(502, `Registry plugin '${pluginId}' has an invalid category.`);
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
        name: corePluginNames[pluginId] ?? pluginId,
        version: "0.0.0",
        main: "",
        enabled: state.enabled,
        source: "core",
        category: corePluginCategories[pluginId] ?? "other",
    };
}

const corePluginCategories: Record<string, PluginCategory> = {
    "smiley-chat-formatter": "interface",
    "smiley-chat-summarizer": "memory-lore",
    "smiley-lorebooks": "memory-lore",
    "smiley-post-processing": "input-output",
    "smiley-mcp": "tools",
    "workspace-tools": "tools",
};

const corePluginNames: Record<string, string> = {
    "smiley-chat-formatter": "smiley-chat-formatter",
    "smiley-chat-summarizer": "smiley-chat-summarizer",
    "smiley-lorebooks": "smiley-lorebooks",
    "smiley-post-processing": "smiley-post-processing",
    "smiley-mcp": "MCP Servers",
    "workspace-tools": "Workspace AI Tools",
};

async function readCorePluginState(pluginId: string) {
    const file = Bun.file(corePluginEnabledPath(pluginId));
    const defaultEnabled = corePluginDefaultEnabled[pluginId] ?? true;

    if (!(await file.exists())) {
        return { enabled: defaultEnabled };
    }

    try {
        const value = (await file.json()) as Record<string, unknown>;
        return {
            enabled: value.enabled !== false,
        };
    } catch {
        return { enabled: defaultEnabled };
    }
}

const corePluginDefaultEnabled: Record<string, boolean> = {
    "smiley-chat-summarizer": false,
    "smiley-post-processing": false,
    "smiley-mcp": false,
    "workspace-tools": false,
};

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
    corePluginIds,
    extractPluginArchive,
    installPluginArtifact,
    normalizePluginRegistry,
    normalizeHttpsArtifactUrl,
    resolveArchiveEntryPath,
    resolveInstallSource,
    readPluginInstallMetadata,
};
