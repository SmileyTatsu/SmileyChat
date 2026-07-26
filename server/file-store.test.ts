import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    readEntitiesFromIds,
    readFileBackedIndex,
    writeFileBackedIndex,
} from "./file-store";

describe("file-backed collection reads", () => {
    test("limits concurrent entity reads while preserving index order", async () => {
        let activeReads = 0;
        let peakReads = 0;
        const ids = Array.from({ length: 24 }, (_, index) => `entity-${index}`);

        const entities = await readEntitiesFromIds(ids, async (id) => {
            activeReads += 1;
            peakReads = Math.max(peakReads, activeReads);
            await new Promise((resolve) => setTimeout(resolve, 2));
            activeReads -= 1;
            return id === "entity-7" ? undefined : id;
        });

        expect(peakReads).toBeLessThanOrEqual(8);
        expect(entities).toEqual(ids.filter((id) => id !== "entity-7"));
    });

    test("reuses one immutable snapshot for cached index reads", async () => {
        const directory = await mkdtemp(join(tmpdir(), "smileychat-file-store-"));
        const indexPath = join(directory, "index.json");

        try {
            await writeFileBackedIndex(indexPath, {
                ids: ["one"],
                metadata: { source: "test" },
            });
            const options = {
                indexPath,
                normalizeIndex: (value: unknown) =>
                    value as {
                        ids: string[];
                        metadata: { source: string };
                    },
                repairIndex: async (index: {
                    ids: string[];
                    metadata: { source: string };
                }) => index,
                rebuildIndex: async () => ({
                    ids: [],
                    metadata: { source: "rebuilt" },
                }),
            };

            const first = await readFileBackedIndex(options);
            const second = await readFileBackedIndex(options);

            expect(second).toBe(first);
            expect(Object.isFrozen(first)).toBe(true);
            expect(Object.isFrozen(first.metadata)).toBe(true);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
