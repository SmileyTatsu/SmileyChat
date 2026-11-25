import { describe, expect, test } from "bun:test";

import { pushRecentModel, toggleFavoriteModel } from "./model-usage";

describe("model usage lists", () => {
    test("adds a favorite at the end", () => {
        expect(toggleFavoriteModel(["a"], "b")).toEqual(["a", "b"]);
        expect(toggleFavoriteModel(undefined, "a")).toEqual(["a"]);
    });

    test("removes an existing favorite", () => {
        expect(toggleFavoriteModel(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    });

    test("ignores blank favorite ids without mutating the list", () => {
        const list = ["a"];
        const next = toggleFavoriteModel(list, "   ");

        expect(next).toEqual(["a"]);
        expect(next).not.toBe(list);
        expect(toggleFavoriteModel(undefined, "")).toEqual([]);
    });

    test("caps favorites at 200 entries by dropping the oldest", () => {
        const list = Array.from({ length: 200 }, (_, index) => `model-${index}`);
        const next = toggleFavoriteModel(list, "newest");

        expect(next).toHaveLength(200);
        expect(next[0]).toBe("model-1");
        expect(next[199]).toBe("newest");
    });

    test("moves a recent model to the front and dedupes", () => {
        expect(pushRecentModel(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
        expect(pushRecentModel(undefined, "a")).toEqual(["a"]);
    });

    test("caps recents at six entries by default", () => {
        const list = ["1", "2", "3", "4", "5", "6"];
        const next = pushRecentModel(list, "7");

        expect(next).toEqual(["7", "1", "2", "3", "4", "5"]);
    });

    test("honors a custom recent limit", () => {
        expect(pushRecentModel(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    });

    test("ignores blank recent ids without mutating the list", () => {
        const list = ["a"];
        const next = pushRecentModel(list, "  ");

        expect(next).toEqual(["a"]);
        expect(next).not.toBe(list);
    });
});
