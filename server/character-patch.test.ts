import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a character patch can carry metadata without touching card data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smileychat-character-patch-"));
    try {
        // Isolate module mocks in a subprocess and keep all writes out of userData.
        const result = Bun.spawnSync(
            [
                process.execPath,
                "-e",
                `
            import { mock } from "bun:test";
            import { join } from "node:path";
            import { mkdir } from "node:fs/promises";
            import { strict as assert } from "node:assert";
            const originalPaths = await import("./server/paths.ts");
            const directory = process.env.CHARACTER_PATCH_TEST_DIR;
            mock.module("./server/paths.ts", () => ({
                ...originalPaths,
                characterIndexPath: join(directory, "index.json"),
                characterLibraryDir: join(directory, "library"),
                characterImportsDir: join(directory, "imports"),
                characterOrphanedDir: join(directory, "orphaned"),
            }));
            await mkdir(join(directory, "library"), { recursive: true });
            const store = await import("./server/character-store.ts");

            const created = await store.createCharacter({
                data: {
                    name: "Patch Target",
                    description: "Original description",
                    personality: "",
                    scenario: "",
                    first_mes: "Hi",
                    mes_example: "",
                },
            });
            const characterId = created.character.id;

            const favorited = await store.patchCharacterById(characterId, {
                metadata: { isFavorite: true },
            });
            assert.equal(favorited.metadata.isFavorite, true);
            assert.equal(favorited.data.description, "Original description");

            const renamed = await store.patchCharacterById(characterId, {
                data: { description: "New description" },
            });
            assert.equal(renamed.data.description, "New description");
            assert.equal(renamed.metadata.isFavorite, true);

            let rejected = false;
            try {
                await store.patchCharacterById(characterId, {});
            } catch {
                rejected = true;
            }
            assert.equal(rejected, true);
            `,
            ],
            {
                cwd: join(import.meta.dir, ".."),
                env: { ...process.env, CHARACTER_PATCH_TEST_DIR: directory },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        expect(result.stderr.toString()).toBe("");
        expect(result.exitCode).toBe(0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
