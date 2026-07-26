import { describe, expect, test } from "bun:test";

import { readEntitiesFromIds } from "./file-store";

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
});
