import { describe, expect, test } from "bun:test";

import { personaToSummary } from "./defaults";
import { normalizePersona, normalizePersonaIndex } from "./normalize";

describe("persona dialogue colors", () => {
    test("normalizes valid hex colors", () => {
        const persona = normalizePersona({
            id: "persona-1",
            name: "Anon",
            description: "",
            dialogueColor: "#28A5D5",
        });

        expect(persona?.dialogueColor).toBe("#28a5d5");
    });

    test("drops invalid dialogue colors", () => {
        const persona = normalizePersona({
            id: "persona-1",
            name: "Anon",
            description: "",
            dialogueColor: "orange",
        });

        expect(persona?.dialogueColor).toBeUndefined();
    });

    test("keeps dialogue colors in persona summaries for chat rendering", () => {
        const persona = normalizePersona({
            id: "persona-1",
            name: "Anon",
            description: "",
            dialogueColor: "#28A5D5",
        });

        expect(persona && personaToSummary(persona).dialogueColor).toBe("#28a5d5");
    });
});

describe("persona index summaries", () => {
    test("migrates legacy indexes without summaries", () => {
        const index = normalizePersonaIndex({
            version: 1,
            activePersonaId: "persona-1",
            personaIds: ["persona-1"],
        });

        expect(index.summaries).toEqual([]);
    });

    test("filters orphaned summaries and preserves persona ID order", () => {
        const index = normalizePersonaIndex({
            version: 1,
            activePersonaId: "persona-2",
            personaIds: ["persona-2", "persona-1"],
            summaries: [
                { id: "persona-1", name: "First", updatedAt: "2026-01-01T00:00:00.000Z" },
                { id: "orphan", name: "Orphan", updatedAt: "2026-01-01T00:00:00.000Z" },
                {
                    id: "persona-2",
                    name: "Second",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(index.summaries.map((summary) => summary.id)).toEqual([
            "persona-2",
            "persona-1",
        ]);
    });
});
