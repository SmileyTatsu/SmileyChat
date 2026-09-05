import { describe, expect, it } from "bun:test";

import {
    highlightText,
    normalizeSearchText,
    searchCharacters,
    type SearchableCharacter,
} from "./character-search";

const testCharacters: SearchableCharacter[] = [
    {
        id: "1",
        name: "Luna",
        tagline: "A gentle moon priestess",
        isFavorite: false,
        updatedAt: "2026-01-01T12:00:00Z",
    },
    {
        id: "2",
        name: "Luna Lovegood",
        tagline: "A quirky ravenclaw student",
        isFavorite: true,
        updatedAt: "2026-02-01T12:00:00Z",
    },
    {
        id: "3",
        name: "Solaris Knight",
        tagline: "Sun warrior sworn to protect Luna",
        isFavorite: false,
    },
    {
        id: "4",
        name: "Gwen Stacy",
        tagline: "Spider-hero from Earth-65",
        tags: ["marvel", "spider-verse"],
        isFavorite: false,
    },
    {
        id: "5",
        name: "René Descartes",
        tagline: "French philosopher",
        isFavorite: false,
    },
];

describe("character-search utility", () => {
    describe("normalizeSearchText", () => {
        it("normalizes case, accents, and whitespace", () => {
            expect(normalizeSearchText("  René  ")).toBe("rene");
            expect(normalizeSearchText("LÜNA")).toBe("luna");
        });
    });

    describe("highlightText", () => {
        it("returns single non-match segment when no ranges provided", () => {
            expect(highlightText("Luna", [])).toEqual([{ text: "Luna", isMatch: false }]);
        });

        it("splits text into matching and non-matching segments", () => {
            const segments = highlightText("Luna Lovegood", [[0, 4]]);
            expect(segments).toEqual([
                { text: "Luna", isMatch: true },
                { text: " Lovegood", isMatch: false },
            ]);
        });

        it("handles multiple and overlapping ranges cleanly", () => {
            const segments = highlightText("Gwen Stacy", [
                [0, 2],
                [1, 4],
                [5, 10],
            ]);
            expect(segments).toEqual([
                { text: "Gwen", isMatch: true },
                { text: " ", isMatch: false },
                { text: "Stacy", isMatch: true },
            ]);
        });
    });

    describe("searchCharacters", () => {
        it("returns all candidates sorted with favorites first on empty query", () => {
            const results = searchCharacters(testCharacters, "");
            expect(results.length).toBe(testCharacters.length);
            expect(results[0].item.name).toBe("Luna Lovegood"); // Favorite first
        });

        it("ranks exact name match higher than prefix match", () => {
            const results = searchCharacters(testCharacters, "Luna");
            expect(results.length).toBeGreaterThanOrEqual(2);
            expect(results[0].item.name).toBe("Luna"); // Exact match beats prefix
        });

        it("matches word boundaries", () => {
            const results = searchCharacters(testCharacters, "Stacy");
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("Gwen Stacy");
            expect(results[0].nameMatches).toEqual([[5, 10]]);
        });

        it("matches diacritics / accents transparently", () => {
            const results = searchCharacters(testCharacters, "rene");
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("René Descartes");
        });

        it("matches taglines when query matches description", () => {
            const results = searchCharacters(testCharacters, "ravenclaw");
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("Luna Lovegood");
            expect(results[0].taglineMatches.length).toBeGreaterThan(0);
        });

        it("matches tags array and sets matchedTag", () => {
            const results = searchCharacters(testCharacters, "spider-verse");
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("Gwen Stacy");
            expect(results[0].matchedTag).toBe("spider-verse");
        });

        it("supports acronym matching", () => {
            const results = searchCharacters(testCharacters, "GS");
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("Gwen Stacy");
        });

        it("supports fuzzy subsequence matching", () => {
            const results = searchCharacters(testCharacters, "lna");
            const names = results.map((r) => r.item.name);
            expect(names).toContain("Luna");
        });

        it("respects favorites filter", () => {
            const results = searchCharacters(testCharacters, "", { filter: "favorites" });
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("Luna Lovegood");
        });

        it("respects maxResults limit", () => {
            const results = searchCharacters(testCharacters, "Luna", { maxResults: 2 });
            expect(results.length).toBe(2);
        });

        it("returns no results for zero or negative limits with and without a query", () => {
            for (const query of ["", "Luna"]) {
                expect(
                    searchCharacters(testCharacters, query, { maxResults: 0 }),
                ).toEqual([]);
                expect(
                    searchCharacters(testCharacters, query, { maxResults: -1 }),
                ).toEqual([]);
            }
        });

        it("ranks the strongest tag match regardless of tag order", () => {
            const character = {
                id: "tags",
                name: "Alice",
                tags: ["dark fantasy", "fantasy"],
            };
            const [first] = searchCharacters([character], "fantasy");
            const [reversed] = searchCharacters(
                [{ ...character, tags: [...character.tags].reverse() }],
                "fantasy",
            );
            expect(first.matchedTag).toBe("fantasy");
            expect(first.score).toBe(reversed.score);
        });

        it("maps prefix, word, acronym, fuzzy and tagline highlights to original Unicode text", () => {
            const character = {
                id: "unicode",
                name: "  Re\u0301ne\u0301 Moon",
                tagline: "  A cafe\u0301 guide",
            };
            for (const [query, expected] of [
                ["rene", "Re\u0301ne\u0301"],
                ["moon", "Moon"],
                ["rm", "RM"],
                ["rnm", "RnM"],
            ]) {
                const [result] = searchCharacters([character], query);
                expect(
                    highlightText(character.name, result.nameMatches)
                        .filter((s) => s.isMatch)
                        .map((s) => s.text)
                        .join(""),
                ).toBe(expected);
            }
            const [result] = searchCharacters([character], "cafe");
            expect(
                highlightText(character.tagline, result.taglineMatches)
                    .filter((s) => s.isMatch)
                    .map((s) => s.text)
                    .join(""),
            ).toBe("cafe\u0301");
        });

        it("preserves full original characters when normalization expands them", () => {
            const name = "\uac00 Moon";
            const [result] = searchCharacters([{ id: "hangul", name }], "\uac00");
            expect(highlightText(name, result.nameMatches)).toEqual([
                { text: "\uac00", isMatch: true },
                { text: " Moon", isMatch: false },
            ]);
        });
    });
});
