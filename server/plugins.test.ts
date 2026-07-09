import AdmZip from "adm-zip";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pluginInstallTestInternals } from "./plugins";

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

test("server knows bundled post-processing core extension", () => {
    expect(pluginInstallTestInternals.corePluginIds.has("smiley-post-processing")).toBe(
        true,
    );
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

async function installZip(pluginsRoot: string, zip: Uint8Array) {
    return pluginInstallTestInternals.installPluginArtifact(zip, {
        expectedPluginId: "example-plugin",
        pluginsRoot,
        source: registrySource("example-plugin"),
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
