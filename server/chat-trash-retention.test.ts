import { describe, expect, test } from "bun:test";

import { selectTrashPurgeCandidates, type TrashCandidate } from "./chat-trash-retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 20);

function candidate(id: string, ageDays: number): TrashCandidate {
    return { path: id, mtime: NOW - ageDays * DAY, isFile: true };
}

describe("trash retention", () => {
    test("keeps the newest entries inside both limits", () => {
        const candidates = [candidate("a", 0), candidate("b", 1), candidate("c", 2)];

        expect(
            selectTrashPurgeCandidates(
                candidates,
                { keepCount: 5, maxAgeMs: 7 * DAY },
                NOW,
            ),
        ).toEqual([]);
    });

    test("drops entries past the count even when they are recent", () => {
        const candidates = [candidate("a", 0), candidate("b", 1), candidate("c", 2)];

        expect(
            selectTrashPurgeCandidates(
                candidates,
                { keepCount: 1, maxAgeMs: 7 * DAY },
                NOW,
            ),
        ).toEqual(["b", "c"]);
    });

    test("drops recent-but-old entries once they age out", () => {
        const candidates = [candidate("fresh", 1), candidate("stale", 9)];

        expect(
            selectTrashPurgeCandidates(
                candidates,
                { keepCount: 40, maxAgeMs: 7 * DAY },
                NOW,
            ),
        ).toEqual(["stale"]);
    });

    test("a zero count purges everything at once", () => {
        const candidates = [candidate("a", 0), candidate("b", 0.5)];

        expect(
            selectTrashPurgeCandidates(
                candidates,
                { keepCount: 0, maxAgeMs: 7 * DAY },
                NOW,
            ),
        ).toEqual(["a", "b"]);
    });
});
