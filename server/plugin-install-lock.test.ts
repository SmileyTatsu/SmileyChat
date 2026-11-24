import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replacePluginFolder } from "./plugins";

const created: string[] = [];

afterEach(async () => {
    for (const dir of created.splice(0)) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
});

async function makePluginFolder() {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-lock-"));
    created.push(root);
    const pluginDir = join(root, "smiley-example");
    await mkdir(join(pluginDir, "dist"), { recursive: true });
    await Bun.write(join(pluginDir, "dist", "index.js"), "export {};\n");
    return { root, pluginDir, backup: join(root, "smiley-example-previous") };
}

test("moves an idle plugin folder aside", async () => {
    const { pluginDir, backup } = await makePluginFolder();

    await replacePluginFolder(pluginDir, backup);

    expect(await Bun.file(join(backup, "dist", "index.js")).exists()).toBe(true);
    expect(await Bun.file(join(pluginDir, "dist", "index.js")).exists()).toBe(false);
});

// The whole point of the retry is Windows behaviour: an open handle inside the
// folder blocks the rename with EPERM, which the install flow turns into a 409
// with an actionable message instead of leaking the raw errno to the UI.
test.skipIf(process.platform !== "win32")(
    "reports a locked plugin folder instead of leaking EPERM",
    async () => {
        const { pluginDir, backup } = await makePluginFolder();
        const handle = await open(join(pluginDir, "dist", "index.js"), "r");

        try {
            let message = "";

            try {
                await replacePluginFolder(pluginDir, backup);
            } catch (error) {
                message = error instanceof Error ? error.message : String(error);
            }

            expect(message).toContain("Could not replace the installed plugin folder");
            expect(await Bun.file(join(pluginDir, "dist", "index.js")).exists()).toBe(
                true,
            );
        } finally {
            await handle.close();
        }
    },
    15_000,
);

// Guards the retry window itself: a handle released mid-retry must not sink the
// install, which is the everyday case (a scanner or editor letting go).
test.skipIf(process.platform !== "win32")(
    "succeeds when the handle is released during the retry window",
    async () => {
        const { pluginDir, backup } = await makePluginFolder();
        const handle = await open(join(pluginDir, "dist", "index.js"), "r");

        setTimeout(() => {
            void handle.close();
        }, 100);

        await replacePluginFolder(pluginDir, backup);

        expect(await Bun.file(join(backup, "dist", "index.js")).exists()).toBe(true);
    },
    15_000,
);
