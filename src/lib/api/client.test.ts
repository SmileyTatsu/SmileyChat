import { afterEach, describe, expect, test } from "bun:test";

import {
    clearLorebookCache,
    importLorebookFiles,
    loadLorebook,
    resetCsrfTokenForTests,
    saveLorebook,
} from "./client";
import type { Lorebook } from "../lorebooks/types";

const originalFetch = globalThis.fetch;

const lorebook: Lorebook = {
    id: "lorebook-1",
    version: 1,
    title: "Original title",
    description: "",
    settings: {
        scanDepth: 2,
        tokenBudget: { mode: "percent", value: 25 },
        includeNames: false,
        recursive: false,
        maxRecursionSteps: 0,
        minActivations: 0,
        minActivationsMaxDepth: 0,
        caseSensitive: false,
        matchWholeWords: false,
        useGroupScoring: false,
        insertionStrategy: "sorted-evenly",
        overflowAlert: false,
    },
    entries: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
    globalThis.fetch = originalFetch;
    clearLorebookCache();
    resetCsrfTokenForTests();
});

describe("LoreBook API cache", () => {
    test("deduplicates repeated and concurrent LoreBook loads", async () => {
        let getRequests = 0;
        globalThis.fetch = (async () => {
            getRequests += 1;
            return jsonResponse(lorebook);
        }) as unknown as typeof fetch;

        const [first, second] = await Promise.all([
            loadLorebook(lorebook.id),
            loadLorebook(lorebook.id),
        ]);
        const third = await loadLorebook(lorebook.id);

        expect(first).toBe(second);
        expect(third).toBe(first);
        expect(getRequests).toBe(1);
    });

    test("replaces a cached LoreBook with the saved server result", async () => {
        let getRequests = 0;
        const savedLorebook = { ...lorebook, title: "Saved title" };
        globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
            if (String(url).endsWith("/api/csrf")) {
                return jsonResponse({ token: "test-csrf-token" });
            }
            if ((init?.method ?? "GET") === "PUT") {
                return jsonResponse({ ok: true, lorebook: savedLorebook });
            }
            getRequests += 1;
            return jsonResponse(lorebook);
        }) as unknown as typeof fetch;

        await loadLorebook(lorebook.id);
        await saveLorebook(savedLorebook);
        const cached = await loadLorebook(lorebook.id);

        expect(cached.title).toBe("Saved title");
        expect(getRequests).toBe(1);
    });

    test("clears cached LoreBooks after an import", async () => {
        let getRequests = 0;
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            if (String(url).endsWith("/api/csrf")) {
                return jsonResponse({ token: "test-csrf-token" });
            }
            if (String(url).endsWith("/api/lorebooks/import")) {
                return jsonResponse({ ok: true, imported: 1, skipped: 0, failed: [] });
            }
            getRequests += 1;
            return jsonResponse(lorebook);
        }) as unknown as typeof fetch;

        await loadLorebook(lorebook.id);
        await importLorebookFiles(new FormData());
        await loadLorebook(lorebook.id);

        expect(getRequests).toBe(2);
    });
});

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
