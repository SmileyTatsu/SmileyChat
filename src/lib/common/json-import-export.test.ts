import { describe, expect, test } from "bun:test";

import { normalizeImportedObject, safeExportFileName } from "./json-import-export";

describe("json import/export helpers", () => {
    test("creates safe export filenames", () => {
        expect(safeExportFileName("My Lore: Book!", ".json")).toBe("my-lore-book.json");
        expect(safeExportFileName("   ", "json", "lorebook")).toBe("lorebook.json");
    });

    test("throws when imported objects do not normalize", () => {
        expect(() =>
            normalizeImportedObject(
                { bad: true },
                (value) => (typeof value === "string" ? { value } : undefined),
                "LoreBook",
            ),
        ).toThrow("LoreBook is not a supported shape.");
    });
});
