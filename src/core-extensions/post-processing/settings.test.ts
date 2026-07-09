import { describe, expect, test } from "bun:test";

import { activePipeline, normalizePostProcessingSettings } from "./settings";

describe("post-processing settings", () => {
    test("normalizes missing settings to a usable disabled default", () => {
        const settings = normalizePostProcessingSettings(undefined);
        const pipeline = activePipeline(settings);

        expect(settings.version).toBe(1);
        expect(settings.enabled).toBe(false);
        expect(settings.autoRun).toBe(false);
        expect(settings.showDiff).toBe(true);
        expect(pipeline?.passes.length).toBe(1);
    });

    test("clamps numeric settings and removes invalid pipelines", () => {
        const settings = normalizePostProcessingSettings({
            enabled: true,
            autoRun: true,
            minChars: -50,
            pipelines: [
                null,
                {
                    id: "pipeline-a",
                    name: "Pipeline A",
                    passes: [
                        {
                            id: "pass-a",
                            name: "Pass A",
                            enabled: false,
                            prompt: "Rewrite {{char}}.",
                            profileId: "profile-a",
                            presetId: "preset-a",
                            modelId: "custom-model",
                            contextMessageLimit: -20,
                            includeCharacter: false,
                            includeSceneContext: false,
                        },
                    ],
                },
            ],
            activePipelineId: "missing",
        });

        expect(settings.enabled).toBe(true);
        expect(settings.autoRun).toBe(true);
        expect(settings.minChars).toBe(0);
        expect(settings.activePipelineId).toBe("pipeline-a");
        expect(settings.pipelines).toHaveLength(1);
        expect(settings.pipelines[0].passes[0]).toMatchObject({
            enabled: false,
            includeCharacter: false,
            includeSceneContext: false,
            contextMessageLimit: -1,
            modelId: "custom-model",
            presetId: "preset-a",
            profileId: "profile-a",
        });
    });

    test("preserves intentionally empty pass prompts", () => {
        const settings = normalizePostProcessingSettings({
            pipelines: [
                {
                    id: "pipeline-a",
                    name: "Pipeline A",
                    passes: [
                        {
                            id: "pass-a",
                            name: "Pass A",
                            prompt: "",
                        },
                    ],
                },
            ],
            activePipelineId: "pipeline-a",
        });

        expect(settings.pipelines[0].passes[0].prompt).toBe("");
    });
});
