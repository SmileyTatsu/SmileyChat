import { describe, expect, test } from "bun:test";

import { importSillyTavernPreset, normalizePreset } from "./normalize";

describe("preset normalization", () => {
    test("adds default sampler settings when a preset has none", () => {
        const preset = normalizePreset({
            id: "preset-a",
            title: "Preset A",
            prompts: [
                {
                    id: "prompt-a",
                    title: "Prompt A",
                    role: "system",
                    content: "Hello",
                },
            ],
            promptOrder: [{ promptId: "prompt-a", enabled: true }],
        });

        expect(preset.generation).toEqual({
            frequencyPenalty: 0,
            presencePenalty: 0,
            repetitionPenalty: 1,
            temperature: 1,
            topP: 1,
        });
    });

    test("imports SillyTavern sampler fields but ignores max token fields", () => {
        const { preset, summary } = importSillyTavernPreset(
            {
                name: "Imported",
                prompts: [
                    {
                        identifier: "main",
                        name: "Main",
                        role: "system",
                        content: "Hello",
                    },
                ],
                prompt_order: [
                    {
                        order: [{ identifier: "main", enabled: true }],
                    },
                ],
                temperature: 0.8,
                top_p: 0.95,
                openai_max_tokens: 4096,
            },
            "Imported",
        );

        expect(preset.generation).toMatchObject({
            temperature: 0.8,
            topP: 0.95,
        });
        expect(summary.importedGenerationFields).toEqual(["temperature", "top_p"]);
        expect(summary.ignoredFields).toContain("openai_max_tokens");
    });
});
