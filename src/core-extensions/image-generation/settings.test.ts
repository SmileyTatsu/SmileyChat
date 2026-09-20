import { describe, expect, test } from "bun:test";

import {
    defaultImageGenerationSettings,
    normalizeImageGenerationSettings,
    ONLY_FREE_MAX_PIXELS,
} from "./settings";

describe("image generation settings", () => {
    test("migrates legacy quality and UC settings", () => {
        expect(
            normalizeImageGenerationSettings({ qualityToggle: false, ucPreset: 3 }),
        ).toMatchObject({ qualityTags: "none", ucPreset: "humanFocus" });
    });

    test("rejects unsupported sampler names", () => {
        expect(normalizeImageGenerationSettings({ sampler: "arbitrary" }).sampler).toBe(
            defaultImageGenerationSettings.sampler,
        );
    });

    test("defaults preset context on and bounds prompt-writer history", () => {
        expect(normalizeImageGenerationSettings({})).toMatchObject({
            includePresetContext: true,
            promptWriterPresetId: "",
            promptWriterHistoryLimit: 8,
            generatedImageContextMode: "tags",
            rawPromptWriter: false,
            promptWriterModelId: "",
        });
        expect(
            normalizeImageGenerationSettings({ promptWriterHistoryLimit: 500 })
                .promptWriterHistoryLimit,
        ).toBe(50);
    });

    test("normalizes rawPromptWriter and promptWriterModelId", () => {
        expect(
            normalizeImageGenerationSettings({
                rawPromptWriter: true,
                promptWriterModelId: "  gpt-4o-mini  ",
            }),
        ).toMatchObject({
            rawPromptWriter: true,
            promptWriterModelId: "gpt-4o-mini",
        });
    });

    test("normalizes generated-image history context mode", () => {
        expect(
            normalizeImageGenerationSettings({ generatedImageContextMode: "label" })
                .generatedImageContextMode,
        ).toBe("label");
        expect(
            normalizeImageGenerationSettings({ generatedImageContextMode: "pixels" })
                .generatedImageContextMode,
        ).toBe("tags");
    });

    test("normalizes allowModelAspectRatio and locks dimensions to standard 832x1216", () => {
        expect(normalizeImageGenerationSettings({})).toMatchObject({
            allowModelAspectRatio: false,
        });

        const enabled = normalizeImageGenerationSettings({
            allowModelAspectRatio: true,
            width: 1536,
            height: 1024,
        });
        expect(enabled.allowModelAspectRatio).toBe(true);
        expect(enabled.width).toBe(832);
        expect(enabled.height).toBe(1216);

        const disabled = normalizeImageGenerationSettings({
            allowModelAspectRatio: false,
            width: 512,
            height: 768,
        });
        expect(disabled.allowModelAspectRatio).toBe(false);
        expect(disabled.width).toBe(512);
        expect(disabled.height).toBe(768);
    });

    test("only-free mode enforces every NovelAI eligibility limit", () => {
        const result = normalizeImageGenerationSettings({
            onlyFree: true,
            width: 1536,
            height: 1024,
            steps: 50,
            imageCount: 4,
        });

        expect(result.width % 64).toBe(0);
        expect(result.height % 64).toBe(0);
        expect(result.width * result.height).toBeLessThanOrEqual(ONLY_FREE_MAX_PIXELS);
        expect(result.steps).toBe(28);
        expect(result.imageCount).toBe(1);
    });
});
