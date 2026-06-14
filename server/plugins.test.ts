import AdmZip from "adm-zip";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { pluginInstallTestInternals } from "./plugins";

const tempRoots: string[] = [];

afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test("plugin archive extraction hoists a single containing folder", async () => {
    const root = await tempRoot();
    const zip = new AdmZip();

    zip.addFile(
        "example-plugin/plugin.json",
        Buffer.from(
            JSON.stringify({
                id: "example-plugin",
                name: "Example Plugin",
                version: "1.0.0",
                main: "dist/index.js",
            }),
        ),
    );
    zip.addFile(
        "example-plugin/dist/index.js",
        Buffer.from("export function activate() {}"),
    );

    await pluginInstallTestInternals.extractPluginArchive(zip.toBuffer(), root);
    await pluginInstallTestInternals.hoistSingleArchiveRoot(root);

    expect(await Bun.file(join(root, "plugin.json")).exists()).toBe(true);
    expect(await Bun.file(join(root, "dist", "index.js")).exists()).toBe(true);
});

test("plugin archive extraction rejects parent path traversal", async () => {
    const root = await tempRoot();

    expect(() =>
        pluginInstallTestInternals.resolveArchiveEntryPath(root, "../evil.txt"),
    ).toThrow("not allowed");
});

test("plugin archive extraction rejects oversized entries before writing", async () => {
    const root = await tempRoot();
    const zip = new AdmZip();

    zip.addFile("plugin.json", Buffer.alloc(10 * 1024 * 1024 + 1));

    await expect(
        pluginInstallTestInternals.extractPluginArchive(zip.toBuffer(), root),
    ).rejects.toThrow("exceeds 10 MB");
    expect(await Bun.file(join(root, "plugin.json")).exists()).toBe(false);
});

async function tempRoot() {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-test-"));
    tempRoots.push(root);
    return root;
}
