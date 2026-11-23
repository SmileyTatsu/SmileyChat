import AdmZip from "adm-zip";
import { afterEach, expect, test } from "bun:test";
import { Glob } from "bun";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpError } from "./http";
import { uninstallPlugin } from "./plugin-uninstall";
import { pluginInstallTestInternals } from "./plugins";

const tempRoots: string[] = [];

afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test("uninstall removes plugin code but keeps saved data by default", async () => {
    const pluginsRoot = await tempRoot();

    await installPlugin(pluginsRoot, "1.0.0");
    await writePluginData(pluginsRoot, { kept: true });

    expect(await discoverPluginManifestPaths(pluginsRoot)).toEqual([
        "example-plugin/plugin.json",
    ]);

    const response = await uninstallPlugin("example-plugin", { pluginsRoot });
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.pluginId).toBe("example-plugin");
    expect(body.deleteData).toBe(false);
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).exists(),
    ).toBe(false);
    expect(
        await Bun.file(
            join(pluginsRoot, "example-plugin", "smileychat-install.json"),
        ).exists(),
    ).toBe(false);
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "dist", "index.js")).exists(),
    ).toBe(false);
    expect(
        await Bun.file(
            join(pluginsRoot, "example-plugin", "data", "settings.json"),
        ).json(),
    ).toEqual({ kept: true });
    expect(await readdir(join(pluginsRoot, "example-plugin"))).toEqual(["data"]);
    expect(await discoverPluginManifestPaths(pluginsRoot)).toEqual([]);
});

test("deleteData removes the plugin folder entirely", async () => {
    const pluginsRoot = await tempRoot();

    await installPlugin(pluginsRoot, "1.0.0");
    await writePluginData(pluginsRoot, { kept: true });

    const response = await uninstallPlugin("example-plugin", {
        pluginsRoot,
        deleteData: true,
    });
    const body = await response.json();

    expect(body.deleteData).toBe(true);
    expect(await pathExists(join(pluginsRoot, "example-plugin"))).toBe(false);
});

test("refuses core plugin IDs", async () => {
    const pluginsRoot = await tempRoot();

    const error = await rejectionOf(
        uninstallPlugin("smiley-chat-formatter", { pluginsRoot }),
    );

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    expect((error as Error).message).toContain("Core extensions cannot be uninstalled");
});

test("refuses local plugin folders that SmileyChat did not install", async () => {
    const pluginsRoot = await tempRoot();
    const pluginRoot = join(pluginsRoot, "example-plugin");

    await mkdir(join(pluginRoot, "dist"), { recursive: true });
    await Bun.write(
        join(pluginRoot, "plugin.json"),
        JSON.stringify({
            id: "example-plugin",
            name: "Example Plugin",
            version: "1.0.0",
            main: "dist/index.js",
        }),
    );
    await Bun.write(
        join(pluginRoot, "dist", "index.js"),
        "export function activate() {}",
    );

    const error = await rejectionOf(uninstallPlugin("example-plugin", { pluginsRoot }));

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    expect((error as Error).message).toContain(
        "Only plugins installed by SmileyChat can be uninstalled",
    );
    expect(await Bun.file(join(pluginRoot, "plugin.json")).exists()).toBe(true);
    expect(await Bun.file(join(pluginRoot, "dist", "index.js")).exists()).toBe(true);
    expect(await discoverPluginManifestPaths(pluginsRoot)).toEqual([
        "example-plugin/plugin.json",
    ]);
});

test("refuses unsafe plugin IDs", async () => {
    const pluginsRoot = await tempRoot();

    for (const pluginId of ["..", ".", "../example-plugin", "nested/example", "bad id"]) {
        const error = await rejectionOf(uninstallPlugin(pluginId, { pluginsRoot }));

        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).status).toBe(400);
        expect((error as Error).message).toContain("not a safe folder name");
    }
});

test("returns 404 for an unknown plugin", async () => {
    const pluginsRoot = await tempRoot();

    const error = await rejectionOf(uninstallPlugin("missing-plugin", { pluginsRoot }));

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
    expect((error as Error).message).toContain("Plugin not found");
});

test("reinstalling after uninstall restores the preserved data", async () => {
    const pluginsRoot = await tempRoot();

    await installPlugin(pluginsRoot, "1.0.0");
    await writePluginData(pluginsRoot, { kept: true });
    await uninstallPlugin("example-plugin", { pluginsRoot });

    await installPlugin(pluginsRoot, "2.0.0");

    expect(
        await Bun.file(
            join(pluginsRoot, "example-plugin", "data", "settings.json"),
        ).json(),
    ).toEqual({ kept: true });
    expect(
        await Bun.file(join(pluginsRoot, "example-plugin", "plugin.json")).json(),
    ).toMatchObject({ version: "2.0.0" });
    expect(await discoverPluginManifestPaths(pluginsRoot)).toEqual([
        "example-plugin/plugin.json",
    ]);
});

function pluginZip(version: string) {
    const zip = new AdmZip();

    zip.addFile(
        "plugin.json",
        Buffer.from(
            JSON.stringify({
                id: "example-plugin",
                name: "Example Plugin",
                version,
                main: "dist/index.js",
                category: "tools",
            }),
        ),
    );
    zip.addFile("dist/index.js", Buffer.from("export function activate() {}"));

    return zip.toBuffer();
}

async function installPlugin(pluginsRoot: string, version: string) {
    return pluginInstallTestInternals.installPluginArtifact(pluginZip(version), {
        expectedPluginId: "example-plugin",
        pluginsRoot,
        source: {
            source: "registry",
            pluginId: "example-plugin",
            artifactUrl: "https://example.com/example-plugin.zip",
        },
    });
}

async function writePluginData(pluginsRoot: string, value: unknown) {
    const dataDir = join(pluginsRoot, "example-plugin", "data");
    await mkdir(dataDir, { recursive: true });
    await Bun.write(join(dataDir, "settings.json"), JSON.stringify(value));
}

async function discoverPluginManifestPaths(pluginsRoot: string) {
    const paths: string[] = [];

    for await (const manifestPath of new Glob("*/plugin.json").scan(pluginsRoot)) {
        paths.push(manifestPath.replace(/\\/g, "/"));
    }

    return paths.sort();
}

async function rejectionOf(promise: Promise<unknown>) {
    return promise.then(
        () => {
            throw new Error("Expected promise to reject");
        },
        (error) => error as Error,
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

async function tempRoot() {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-uninstall-test-"));
    tempRoots.push(root);
    return root;
}
