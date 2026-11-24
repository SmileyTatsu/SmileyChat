import AdmZip from "adm-zip";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CORE_PLUGIN_CATALOG } from "#frontend/lib/plugins/core-catalog";
import { MOVED_CORE_PLUGINS } from "#frontend/lib/plugins/moved-plugins";
import { APP_VERSION } from "#frontend/lib/app-version";
import { PLUGIN_API_VERSION } from "#frontend/lib/plugins/compatibility";

import { pluginInstallTestInternals, servePluginAsset } from "./plugins";

const tempRoots: string[] = [];
const originalManualFlag = Bun.env.SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS;

afterEach(async () => {
    if (originalManualFlag === undefined) {
        delete Bun.env.SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS;
    } else {
        Bun.env.SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS = originalManualFlag;
    }

    for (const root of tempRoots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test("registry accepts release artifact entries", () => {
    const registry = pluginInstallTestInternals.normalizePluginRegistry({
        version: 1,
        plugins: [
            {
                id: "example-plugin",
                name: "Example Plugin",
                version: "1.0.0",
                category: "tools",
                status: "verified",
                repository: "https://github.com/user/example-plugin",
                artifact: {
                    url: "https://example.com/releases/example-plugin-1.0.0.zip",
                },
            },
        ],
    });

    expect(registry.plugins[0].artifact.url).toBe(
        "https://example.com/releases/example-plugin-1.0.0.zip",
    );
    expect(registry.plugins[0].repository).toBe("https://github.com/user/example-plugin");
});

test("server knows bundled core extensions", () => {
    expect(pluginInstallTestInternals.corePluginIds.has("smiley-mcp")).toBe(true);
    expect(pluginInstallTestInternals.corePluginIds.has("smiley-lorebooks")).toBe(true);
});

test("extensions that moved to the Store are no longer reserved core ids", () => {
    for (const plugin of MOVED_CORE_PLUGINS) {
        expect(pluginInstallTestInternals.corePluginIds.has(plugin.id)).toBe(false);
    }
});

test("server core manifests come from the shared catalog", async () => {
    const manifests = await pluginInstallTestInternals.readCorePluginManifests();

    expect(manifests.map((manifest) => manifest.id).sort()).toEqual(
        CORE_PLUGIN_CATALOG.map((entry) => entry.id).sort(),
    );

    for (const entry of CORE_PLUGIN_CATALOG) {
        const manifest = manifests.find((candidate) => candidate.id === entry.id);

        expect(manifest?.name).toBe(entry.name);
        expect(manifest?.category).toBe(entry.category);
        expect(manifest?.defaultEnabled).toBe(entry.defaultEnabled);
    }
});

test("telemetry accepts bounded batches and retains single-entry compatibility", () => {
    expect(
        pluginInstallTestInternals.normalizePluginTelemetryEntries({
            entries: [
                { level: "debug", message: "first" },
                { level: "warn", message: "second", detail: { value: "kept" } },
            ],
        }),
    ).toEqual([
        { level: "debug", message: "first" },
        { level: "warn", message: "second", detail: { value: "kept" } },
    ]);
    expect(
        pluginInstallTestInternals.normalizePluginTelemetryEntries({
            level: "info",
            message: "legacy entry",
        }),
    ).toEqual([{ level: "info", message: "legacy entry" }]);
    expect(
        pluginInstallTestInternals.normalizePluginTelemetryEntries({
            entries: Array.from({ length: 33 }, () => ({
                level: "info",
                message: "too many",
            })),
        }),
    ).toBeUndefined();
});

test("registry rejects invalid category, status, id, and artifact URL", () => {
    expect(() =>
        pluginInstallTestInternals.normalizePluginRegistry({
            version: 1,
            plugins: [registryEntry({ category: "bad-category" })],
        }),
    ).toThrow("invalid category");

    expect(() =>
        pluginInstallTestInternals.normalizePluginRegistry({
            version: 1,
            plugins: [registryEntry({ status: "experimental" })],
        }),
    ).toThrow("invalid status");

    expect(() =>
        pluginInstallTestInternals.normalizePluginRegistry({
            version: 1,
            plugins: [registryEntry({ id: "../bad" })],
        }),
    ).toThrow("not a safe folder name");

    expect(() =>
        pluginInstallTestInternals.normalizePluginRegistry({
            version: 1,
            plugins: [
                registryEntry({
                    artifact: { url: "http://example.com/plugin.zip" },
                }),
            ],
        }),
    ).toThrow("HTTPS ZIP URL");
});

test("registry permissions are optional, deduped, and bounded", () => {
    const normalize = pluginInstallTestInternals.normalizePluginRegistry;

    expect(
        normalize({
            version: 1,
            plugins: [registryEntry({ permissions: [" state:read ", "state:read"] })],
        }).plugins[0].permissions,
    ).toEqual(["state:read"]);

    expect(
        normalize({ version: 1, plugins: [registryEntry()] }).plugins[0].permissions,
    ).toBeUndefined();

    expect(
        normalize({ version: 1, plugins: [registryEntry({ permissions: [] })] })
            .plugins[0].permissions,
    ).toEqual([]);

    expect(() =>
        normalize({
            version: 1,
            plugins: [registryEntry({ permissions: "state:read" })],
        }),
    ).toThrow("permissions must be an array");

    expect(() =>
        normalize({ version: 1, plugins: [registryEntry({ permissions: ["  "] })] }),
    ).toThrow("invalid permission entry");

    expect(() =>
        normalize({
            version: 1,
            plugins: [registryEntry({ permissions: ["x".repeat(65)] })],
        }),
    ).toThrow("longer than 64 characters");

    expect(() =>
        normalize({
            version: 1,
            plugins: [
                registryEntry({
                    permissions: Array.from({ length: 33 }, (_, index) => `p:${index}`),
                }),
            ],
        }),
    ).toThrow("more than 32 permissions");
});

test("registry install rejects artifacts asking for undeclared permissions", async () => {
    const pluginsRoot = await tempRoot();
    const zip = pluginZip({
        manifest: { permissions: ["state:read", "network:fetch"] },
    });

    await expect(
        installZip(pluginsRoot, zip, { permissions: ["state:read"] }),
    ).rejects.toThrow("does not list these permissions: network:fetch");

    expect(await Bun.file(join(pluginsRoot, "example-plugin")).exists()).toBe(false);

    await expect(installZip(pluginsRoot, zip, { permissions: [] })).rejects.toThrow(
        "does not list these permissions: network:fetch, state:read",
    );

    const response = await installZip(pluginsRoot, zip, {
        permissions: ["network:fetch", "state:read"],
    });
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.plugin.permissions).toEqual(["state:read", "network:fetch"]);
});

test("registry entries without permissions and manual artifacts stay permissive", async () => {
    const zip = pluginZip({
        manifest: { permissions: ["connections:secrets"] },
    });

    const registryRoot = await tempRoot();
    const registryResponse = await installZip(registryRoot, zip);

    expect((await registryResponse.json()).ok).toBe(true);

    const manualRoot = await tempRoot();
    const manualResponse = await pluginInstallTestInternals.installPluginArtifact(zip, {
        pluginsRoot: manualRoot,
        source: {
            source: "manual-artifact",
            artifactUrl: "https://example.com/example-plugin.zip",
            unverified: true,
        },
    });

    expect((await manualResponse.json()).ok).toBe(true);
});

test("installed metadata stays free of registry permission allowlists", async () => {
    const pluginsRoot = await tempRoot();

    await installZip(pluginsRoot, pluginZip(), { permissions: ["state:read"] });

    const metadata = await Bun.file(
        join(pluginsRoot, "example-plugin", "smileychat-install.json"),
    ).json();

    expect(metadata).not.toHaveProperty("permissions");
});

test("manual artifact install request is gated by env flag", async () => {
    delete Bun.env.SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS;

    await expect(
        pluginInstallTestInternals.resolveInstallSource({
            artifactUrl: "https://example.com/plugin.zip",
        }),
    ).rejects.toThrow("Manual plugin install is disabled");

    Bun.env.SMILEYCHAT_ALLOW_UNVERIFIED_PLUGINS = "true";

    await expect(
        pluginInstallTestInternals.resolveInstallSource({
            artifactUrl: "https://example.com/plugin.zip",
        }),
    ).resolves.toMatchObject({
        source: "manual-artifact",
        artifactUrl: "https://example.com/plugin.zip",
        unverified: true,
    });
});

test("installs prebuilt artifact and writes install metadata", async () => {
    const pluginsRoot = await tempRoot();
    const response = await installZip(pluginsRoot, pluginZip());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).exists(),
    ).toBe(true);
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "dist", "index.js")).exists(),
    ).toBe(true);

    const metadata = await pluginInstallTestInternals.readPluginInstallMetadata(
        join(pluginsRoot, "example-plugin"),
    );

    expect(metadata).toMatchObject({
        source: "registry",
        pluginId: "example-plugin",
        artifactUrl: "https://example.com/example-plugin.zip",
    });
    expect(body.plugin.entryUrl).toContain("?v=");
});

test("installing a moved extension adopts its bundled data", async () => {
    const root = await tempRoot();
    const legacyRoot = join(root, "core-extensions");
    const pluginDir = join(root, "smiley-chat-summarizer");
    // The bundled copy predates the `smiley-` prefix on data folders.
    const legacyDir = join(legacyRoot, "chat-summarizer");

    await mkdir(legacyDir, { recursive: true });
    await Bun.write(join(legacyDir, "settings.json"), '{"summaryWindow":12}');
    await Bun.write(join(legacyDir, "summary-chat-1.json"), '{"summary":"kept"}');
    await Bun.write(join(legacyDir, "enabled.json"), '{"enabled":true}');
    await mkdir(pluginDir, { recursive: true });
    await Bun.write(join(pluginDir, "settings.json"), '{"summaryWindow":3}');

    await pluginInstallTestInternals.adoptMovedCorePluginData(
        "smiley-chat-summarizer",
        pluginDir,
        legacyRoot,
    );

    // Missing keys come across, an existing one wins (a reinstall must not roll
    // settings back), and the app's enable state is not plugin data.
    expect(await Bun.file(join(pluginDir, "data", "summary-chat-1.json")).text()).toBe(
        '{"summary":"kept"}',
    );
    expect(await Bun.file(join(pluginDir, "data", "enabled.json")).exists()).toBe(false);
    expect(await Bun.file(join(pluginDir, "settings.json")).text()).toBe(
        '{"summaryWindow":3}',
    );
});

test("adopting data ignores plugins that never lived in the bundle", async () => {
    const root = await tempRoot();
    const pluginDir = join(root, "unrelated-plugin");
    await mkdir(pluginDir, { recursive: true });

    await pluginInstallTestInternals.adoptMovedCorePluginData(
        "unrelated-plugin",
        pluginDir,
        join(root, "core-extensions"),
    );

    expect(await Bun.file(join(pluginDir, "data")).exists()).toBe(false);
});

test("artifact accepts standard leading dot slash manifest paths", async () => {
    const pluginsRoot = await tempRoot();
    const response = await installZip(
        pluginsRoot,
        pluginZip({
            manifest: {
                main: "./dist/index.js",
                styles: ["./dist/plugin.css"],
            },
            files: {
                "plugin.json": JSON.stringify(
                    baseManifest({
                        main: "./dist/index.js",
                        styles: ["./dist/plugin.css"],
                    }),
                ),
                "dist/index.js": "export function activate() {}",
                "dist/plugin.css": ".example-plugin-root { color: inherit; }",
            },
        }),
    );
    const body = await response.json();

    expect(body.plugin.entryUrl).toContain("/plugins/example-plugin/dist/index.js?v=");
    expect(body.plugin.styleUrls[0]).toContain(
        "/plugins/example-plugin/dist/plugin.css?v=",
    );
});

test("update preserves existing data directory", async () => {
    const pluginsRoot = await tempRoot();

    await installZip(pluginsRoot, pluginZip({ version: "1.0.0" }));
    await mkdir(join(pluginsRoot, "example-plugin", "data"), { recursive: true });
    await Bun.write(
        join(pluginsRoot, "example-plugin", "data", "settings.json"),
        JSON.stringify({ kept: true }),
    );

    await installZip(pluginsRoot, pluginZip({ version: "2.0.0" }));

    expect(
        await Bun.file(
            join(pluginsRoot, "example-plugin", "data", "settings.json"),
        ).json(),
    ).toEqual({ kept: true });
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).json(),
    ).toMatchObject({ version: "2.0.0" });
});

test("failed update rolls back to the previous plugin", async () => {
    const pluginsRoot = await tempRoot();

    await installZip(pluginsRoot, pluginZip({ version: "1.0.0" }));

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                files: {
                    "plugin.json": JSON.stringify({
                        id: "example-plugin",
                        name: "Example Plugin",
                        version: "2.0.0",
                        main: "dist/missing.js",
                    }),
                },
            }),
        ),
    ).rejects.toThrow("main file does not exist");

    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).json(),
    ).toMatchObject({ version: "1.0.0" });
});

test("artifact without root plugin.json is rejected", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                files: {
                    "nested/plugin.json": "{}",
                    "nested/dist/index.js": "export function activate() {}",
                },
            }),
        ),
    ).rejects.toThrow("root plugin.json");
});

test("registry install rejects manifest ID mismatch and core collisions", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(pluginsRoot, pluginZip({ manifest: { id: "other-plugin" } })),
    ).rejects.toThrow("does not match expected ID");

    await expect(
        pluginInstallTestInternals.installPluginArtifact(
            pluginZip({ manifest: { id: "smiley-chat-formatter" } }),
            {
                expectedPluginId: "smiley-chat-formatter",
                pluginsRoot,
                source: registrySource("smiley-chat-formatter"),
            },
        ),
    ).rejects.toThrow("core extension");
});

test("manual artifact rejects missing or relative manifest IDs", async () => {
    const pluginsRoot = await tempRoot();

    for (const id of ["", ".", ".."]) {
        await expect(
            pluginInstallTestInternals.installPluginArtifact(
                pluginZip({
                    manifest: { id },
                }),
                {
                    pluginsRoot,
                    source: {
                        source: "manual-artifact",
                        artifactUrl: "https://example.com/manual-plugin.zip",
                        unverified: true,
                    },
                },
            ),
        ).rejects.toThrow("manifest ID is missing or is not a safe folder name");
    }

    expect(await Bun.file(join(pluginsRoot, "plugin.json")).exists()).toBe(false);
});

test("artifact extraction rejects traversal, absolute, and Windows drive paths", async () => {
    const pluginsRoot = await tempRoot();

    expect(() =>
        pluginInstallTestInternals.resolveArchiveEntryPath(pluginsRoot, "../evil.txt"),
    ).toThrow("not allowed");
    expect(() =>
        pluginInstallTestInternals.resolveArchiveEntryPath(pluginsRoot, "/evil.txt"),
    ).toThrow("not allowed");
    expect(() =>
        pluginInstallTestInternals.resolveArchiveEntryPath(pluginsRoot, "C:/evil.txt"),
    ).toThrow("not allowed");
});

test("artifact rejects missing declared main or style files", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                manifest: {
                    main: "dist/missing.js",
                },
            }),
        ),
    ).rejects.toThrow("main file does not exist");

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                manifest: {
                    main: "/etc/passwd",
                },
            }),
        ),
    ).rejects.toThrow("Downloaded plugin main file path is not a safe relative path");

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                manifest: {
                    styles: ["dist/missing.css"],
                },
            }),
        ),
    ).rejects.toThrow("style file 'dist/missing.css' does not exist");
});

test("failed install after backup restores the previous plugin", async () => {
    const pluginsRoot = await tempRoot();

    await installZip(pluginsRoot, pluginZip({ version: "1.0.0" }));

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                files: {
                    "plugin.json": JSON.stringify(baseManifest({ version: "2.0.0" })),
                    "dist/index.js": "export function activate() {}",
                    "smileychat-install.json/blocked.txt": "blocks metadata write",
                },
            }),
        ),
    ).rejects.toThrow();

    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).json(),
    ).toMatchObject({ version: "1.0.0" });
});

test("oversized files are rejected before writing and staging is cleaned", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                files: {
                    "plugin.json": JSON.stringify(baseManifest()),
                    "dist/index.js": Buffer.alloc(10 * 1024 * 1024 + 1),
                },
            }),
        ),
    ).rejects.toThrow("exceeds 10 MB");

    expect(await Bun.file(join(pluginsRoot, "example-plugin")).exists()).toBe(false);
    await expect(readdir(join(pluginsRoot, ".installing"))).resolves.toEqual([]);
});

function registryEntry(patch: Record<string, unknown> = {}) {
    return {
        id: "example-plugin",
        name: "Example Plugin",
        version: "1.0.0",
        category: "tools",
        status: "verified",
        artifact: { url: "https://example.com/example-plugin.zip" },
        ...patch,
    };
}

function baseManifest(patch: Record<string, unknown> = {}) {
    return {
        id: "example-plugin",
        name: "Example Plugin",
        version: "1.0.0",
        main: "dist/index.js",
        category: "tools",
        ...patch,
    };
}

function pluginZip(
    options: {
        files?: Record<string, string | Buffer>;
        manifest?: Record<string, unknown>;
        version?: string;
    } = {},
) {
    const zip = new AdmZip();
    const manifest = baseManifest({
        version: options.version ?? "1.0.0",
        ...(options.manifest ?? {}),
    });
    const files = options.files ?? {
        "plugin.json": JSON.stringify(manifest),
        "dist/index.js": "export function activate() {}",
    };

    for (const [path, content] of Object.entries(files)) {
        zip.addFile(path, Buffer.isBuffer(content) ? content : Buffer.from(content));
    }

    return zip.toBuffer();
}

async function installZip(
    pluginsRoot: string,
    zip: Uint8Array,
    sourcePatch: { permissions?: string[] } = {},
) {
    return pluginInstallTestInternals.installPluginArtifact(zip, {
        expectedPluginId: "example-plugin",
        pluginsRoot,
        source: { ...registrySource("example-plugin"), ...sourcePatch },
    });
}

function registrySource(pluginId: string) {
    return {
        source: "registry" as const,
        pluginId,
        artifactUrl: `https://example.com/${pluginId}.zip`,
    };
}

async function tempRoot() {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-test-"));
    tempRoots.push(root);
    return root;
}

test("servePluginAsset rejects path traversal attempts and malformed encoding", async () => {
    const resDotDot = await servePluginAsset(
        new URL("http://localhost:4173/plugins/%2e%2e/settings/connection-secrets.json"),
    );
    expect(resDotDot.status).toBe(404);

    const resSlash = await servePluginAsset(
        new URL("http://localhost:4173/plugins/..%2F../.env"),
    );
    expect(resSlash.status).toBe(404);

    const resAssetTraversal = await servePluginAsset(
        new URL("http://localhost:4173/plugins/some-plugin/..%2Fsecret.txt"),
    );
    expect(resAssetTraversal.status).toBe(404);

    const resMalformed = await servePluginAsset(
        new URL("http://localhost:4173/plugins/%zz/file.txt"),
    );
    expect(resMalformed.status).toBe(404);

    const resNul = await servePluginAsset(
        new URL("http://localhost:4173/plugins/some-plugin/%00x"),
    );
    expect(resNul.status).toBe(404);

    const resNulFolder = await servePluginAsset(
        new URL("http://localhost:4173/plugins/%00/file.txt"),
    );
    expect(resNulFolder.status).toBe(404);

    const resEmpty = await servePluginAsset(new URL("http://localhost:4173/plugins/"));
    expect(resEmpty.status).toBe(404);
});

test("registry entries may declare apiVersion and minAppVersion", () => {
    const registry = pluginInstallTestInternals.normalizePluginRegistry({
        version: 1,
        plugins: [
            {
                id: "example-plugin",
                name: "Example Plugin",
                version: "1.0.0",
                category: "tools",
                status: "verified",
                apiVersion: PLUGIN_API_VERSION,
                minAppVersion: "0.0.1",
                artifact: {
                    url: "https://example.com/releases/example-plugin-1.0.0.zip",
                },
            },
        ],
    });

    expect(registry.plugins[0].apiVersion).toBe(PLUGIN_API_VERSION);
    expect(registry.plugins[0].minAppVersion).toBe("0.0.1");
});

test("registry rejects malformed compatibility fields", () => {
    const entry = {
        id: "example-plugin",
        name: "Example Plugin",
        version: "1.0.0",
        category: "tools",
        status: "verified",
        artifact: { url: "https://example.com/releases/example-plugin-1.0.0.zip" },
    };

    for (const apiVersion of ["2", 0, 1.5]) {
        expect(() =>
            pluginInstallTestInternals.normalizePluginRegistry({
                version: 1,
                plugins: [{ ...entry, apiVersion }],
            }),
        ).toThrow("apiVersion must be a whole number of 1 or higher");
    }

    for (const minAppVersion of ["", "next", 1.2]) {
        expect(() =>
            pluginInstallTestInternals.normalizePluginRegistry({
                version: 1,
                plugins: [{ ...entry, minAppVersion }],
            }),
        ).toThrow("minAppVersion must be a version such as 1.2.0");
    }
});

test("registry compatibility is refused before the artifact download", () => {
    expect(() =>
        pluginInstallTestInternals.assertInstallSourceCompatibility({
            source: "registry",
            pluginId: "future-plugin",
            artifactUrl: "https://example.com/future-plugin.zip",
            apiVersion: PLUGIN_API_VERSION + 1,
        }),
    ).toThrow("targets plugin API");

    expect(() =>
        pluginInstallTestInternals.assertInstallSourceCompatibility({
            source: "registry",
            pluginId: "newer-app-plugin",
            artifactUrl: "https://example.com/newer-app-plugin.zip",
            minAppVersion: "999.0.0",
        }),
    ).toThrow(`needs SmileyChat 999.0.0 or newer. This is SmileyChat ${APP_VERSION}.`);

    expect(() =>
        pluginInstallTestInternals.assertInstallSourceCompatibility({
            source: "registry",
            pluginId: "compatible-plugin",
            artifactUrl: "https://example.com/compatible-plugin.zip",
            apiVersion: PLUGIN_API_VERSION,
            minAppVersion: APP_VERSION,
        }),
    ).not.toThrow();
});

test("installer refuses a plugin built for a newer plugin API", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({ manifest: { apiVersion: PLUGIN_API_VERSION + 1 } }),
        ),
    ).rejects.toThrow("targets plugin API");

    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).exists(),
    ).toBe(false);
});

test("installer refuses an artifact that needs a newer app version", async () => {
    const pluginsRoot = await tempRoot();

    await expect(
        installZip(pluginsRoot, pluginZip({ manifest: { minAppVersion: "999.0.0" } })),
    ).rejects.toThrow("needs SmileyChat 999.0.0 or newer");

    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).exists(),
    ).toBe(false);
});

test("a rejected incompatible update keeps the installed plugin folder", async () => {
    const pluginsRoot = await tempRoot();

    await installZip(pluginsRoot, pluginZip({ version: "1.0.0" }));

    await expect(
        installZip(
            pluginsRoot,
            pluginZip({
                version: "2.0.0",
                manifest: { apiVersion: PLUGIN_API_VERSION + 1 },
            }),
        ),
    ).rejects.toThrow("targets plugin API");

    const manifest = await Bun.file(
        join(pluginsRoot, "example-plugin", "plugin.json"),
    ).json();

    expect(manifest.version).toBe("1.0.0");
});

test("installer accepts a manifest that declares the supported contract", async () => {
    const pluginsRoot = await tempRoot();

    const response = await installZip(
        pluginsRoot,
        pluginZip({ manifest: { apiVersion: PLUGIN_API_VERSION } }),
    );
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.plugin.apiVersion).toBe(PLUGIN_API_VERSION);
    expect(body.plugin.compatibilityError).toBeUndefined();
});
