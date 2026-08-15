import { describe, expect, test } from "bun:test";

import { personaToSummary } from "./defaults";
import { normalizePersona } from "./normalize";

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
