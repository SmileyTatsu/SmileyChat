import { describe, expect, test } from "bun:test";

import { normalizeLorebook } from "./normalize";
import { exportSillyTavernLorebook, importSillyTavernLorebook } from "./sillytavern";

describe("lorebook normalization", () => {
    test("normalizes native lorebooks", () => {
        const lorebook = normalizeLorebook({
            id: "book-1",
            title: "World",
            description: "Setting notes",
            entries: [
                {
                    id: "entry-1",
                    title: "Capital",
                    keys: ["capital"],
                    content: "The capital is under glass.",
                    enabled: true,
                },
            ],
            metadata: { active: true },
            extensions: { source: "test" },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(lorebook?.title).toBe("World");
        expect(lorebook?.entries[0].keys).toEqual(["capital"]);
        expect(lorebook?.metadata?.active).toBe(true);
        expect(lorebook?.extensions?.source).toBe("test");
    });

    test("imports SillyTavern World Info entries", () => {
        const lorebook = importSillyTavernLorebook(
            {
                name: "Imported World",
                scan_depth: 6,
                entries: {
                    "0": {
                        uid: 0,
                        key: ["moon"],
                        keysecondary: ["silver"],
                        comment: "Moon",
                        content: "The moon is artificial.",
                        order: 50,
                        position: 6,
                        depth: 2,
                    },
                },
            },
            { sourceFileName: "world.json" },
        );

        expect(lorebook.title).toBe("Imported World");
        expect(lorebook.settings.scanDepth).toBe(6);
        expect(lorebook.entries[0].position).toBe("at-depth");
        expect(lorebook.entries[0].secondaryKeys).toEqual(["silver"]);
        expect(lorebook.importedFrom?.format).toBe("sillytavern");
    });

    test("exports SillyTavern World Info entries", () => {
        const lorebook = importSillyTavernLorebook({
            name: "World",
            entries: {
                "0": {
                    uid: 0,
                    key: ["city"],
                    comment: "City",
                    content: "The city never sleeps.",
                    order: 10,
                },
            },
        });
        const exported = exportSillyTavernLorebook(lorebook);

        expect(exported.name).toBe("World");
        expect(exported.entries["0"].key).toEqual(["city"]);
        expect(exported.entries["0"].content).toBe("The city never sleeps.");
    });
});
