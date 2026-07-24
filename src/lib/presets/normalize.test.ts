import { describe, expect, test } from "bun:test";

import { resolvePresetStreaming } from "./generation";
import { importSillyTavernPreset, normalizePreset } from "./normalize";

describe("preset normalization", () => {
    test("preserves presets without generation overrides", () => {
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

        expect(preset.generation).toBeUndefined();
    });

    test("normalizes only explicit generation settings", () => {
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
            generation: {
                temperature: 0.8,
            },
        });

        expect(preset.generation).toEqual({
            temperature: 0.8,
        });
    });

    test("normalizes explicit streaming generation overrides", () => {
        const enabled = normalizePreset({
            id: "preset-enabled",
            title: "Enabled",
            generation: { streaming: true },
        });
        const disabled = normalizePreset({
            id: "preset-disabled",
            title: "Disabled",
            generation: { streaming: false },
        });
        const invalid = normalizePreset({
            id: "preset-invalid",
            title: "Invalid",
            generation: { streaming: "yes" },
        });

        expect(enabled.generation).toEqual({ streaming: true });
        expect(disabled.generation).toEqual({ streaming: false });
        expect(invalid.generation).toBeUndefined();
    });

    test("resolves streaming preset overrides before the legacy fallback", () => {
        expect(resolvePresetStreaming({ streaming: true }, false)).toBeTrue();
        expect(resolvePresetStreaming({ streaming: false }, true)).toBeFalse();
        expect(resolvePresetStreaming(undefined, true)).toBeTrue();
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

    test("imports SillyTavern streaming fields and prefers stream_openai", () => {
        const { preset, summary } = importSillyTavernPreset(
            {
                name: "Imported",
                prompts: [],
                stream: false,
                stream_openai: true,
            },
            "Imported",
        );

        expect(preset.generation).toEqual({ streaming: true });
        expect(summary.importedGenerationFields).toEqual(["stream", "stream_openai"]);
        expect(summary.ignoredFields).not.toContain("stream_openai");
    });

    test("imports the real SillyTavern character prompt order before dummy orders", () => {
        const { preset } = importSillyTavernPreset(
            {
                name: "Imported",
                prompts: [
                    {
                        identifier: "main",
                        name: "Main",
                        role: "system",
                        content: "Main prompt",
                    },
                    {
                        identifier: "extra",
                        name: "Extra",
                        role: "system",
                        content: "Extra prompt",
                    },
                ],
                prompt_order: [
                    {
                        character_id: 100000,
                        order: [
                            { identifier: "main", enabled: true },
                            { identifier: "extra", enabled: true },
                        ],
                    },
                    {
                        character_id: 100001,
                        order: [{ identifier: "main", enabled: false }],
                    },
                ],
            },
            "Imported",
        );

        expect(preset.promptOrder).toEqual([
            { promptId: "main", enabled: false },
            { promptId: "extra", enabled: true },
        ]);
    });
});
