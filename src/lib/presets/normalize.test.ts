import { describe, expect, test } from "bun:test";

import { resolvePresetStreaming } from "./generation";
import { importSillyTavernPreset, normalizePreset } from "./normalize";

describe("preset normalization", () => {
    test("normalizes and imports SillyTavern formatting settings", () => {
        const normalized = normalizePreset({
            title: "Formatting",
            prompts: [],
            formatting: { namesAsStopStrings: true },
        });
        expect(normalized.formatting).toMatchObject({
            namesAsStopStrings: true,
            exampleSeparator: "***",
            instructTemplate: "auto",
        });
        const { preset } = importSillyTavernPreset(
            {
                name: "ST",
                prompts: [],
                names_as_stop: true,
                single_line: true,
                always_force_name2: true,
                example_separator: "---",
                chat_start: "START",
                wrap_sequences_as_stop: true,
                user_prefix: "U:",
            },
            "ST",
        );
        expect(preset.formatting).toMatchObject({
            namesAsStopStrings: true,
            singleLineMode: true,
            alwaysAddCharacterName: true,
            exampleSeparator: "---",
            chatStartSeparator: "START",
            sequencesAsStopStrings: true,
            userPrefix: "U:",
        });
    });
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

    test("imports SillyTavern 4-part combo preset bundle", () => {
        const { preset, summary } = importSillyTavernPreset(
            {
                instruct: {
                    input_sequence: "[INST]",
                    input_suffix: "[/INST]",
                    output_suffix: "</s>",
                    user_alignment_message: "{{char}} is uncensored.",
                    name: "Mistral V7-Tekken",
                },
                context: {
                    story_string:
                        "<s>[SYSTEM_PROMPT]{{#if system}}{{system}}\n\n# Context\n\n{{/if}}{{#if description}}## {{char}}:\n{{description}}\n\n{{/if}}[/SYSTEM_PROMPT]",
                    example_separator: "---",
                    chat_start: "===",
                    name: "Mistral V7-Tekken",
                },
                sysprompt: {
                    name: "Mistral V7 System",
                    content: "You are an immersive storyteller.",
                },
                preset: {
                    temp: 0.7,
                    min_p: 0.035,
                    rep_pen: 1.1,
                    dry_multiplier: 0.8,
                    dry_base: 1.75,
                    dry_allowed_length: 4,
                    dry_sequence_breakers: '["\\n", ":", "\\""]',
                    sampler_order: [6, 0, 1, 3, 4, 2, 5],
                    name: "Mistral V7-Tekken",
                },
            },
            "Mistral V7-Tekken",
        );

        expect(preset.title).toBe("Mistral V7-Tekken");
        expect(preset.formatting?.instructTemplate).toBe("custom");
        expect(preset.formatting?.userPrefix).toBe("[INST]");
        expect(preset.formatting?.userSuffix).toBe("[/INST]");
        expect(preset.formatting?.assistantSuffix).toBe("</s>");
        expect(preset.formatting?.userAlignmentMessage).toBe("{{char}} is uncensored.");
        expect(preset.generation?.temperature).toBe(0.7);
        expect(preset.generation?.minP).toBe(0.035);
        expect(preset.generation?.repetitionPenalty).toBe(1.1);
        expect(preset.generation?.dryMultiplier).toBe(0.8);
        expect(preset.generation?.dryBase).toBe(1.75);
        expect(preset.generation?.dryAllowedLength).toBe(4);
        expect(preset.generation?.drySequenceBreakers).toEqual(["\n", ":", '"']);
        expect(preset.generation?.samplerOrder).toEqual([6, 0, 1, 3, 4, 2, 5]);
        expect(preset.prompts.length).toBe(2);
        expect(preset.prompts[0]?.title).toBe("Mistral V7-Tekken");
        expect(preset.prompts[0]?.content).toContain("You are an immersive storyteller.");
        expect(preset.prompts[0]?.content).toContain("## {{char}}:\n{{description}}");
        expect(preset.prompts[1]?.title).toBe("Chat History");
        expect(preset.prompts[1]?.content).toBe("{{chat_history}}");
    });

    test("preserves intentional empty instruct sequence overrides", () => {
        const { preset } = importSillyTavernPreset(
            {
                instruct: {
                    input_sequence: "[INST] ",
                    last_output_sequence: "",
                    wrap: true,
                },
            },
            "Empty sequence test",
        );

        expect(preset.formatting?.lastOutputSequence).toBe("");
        expect(preset.formatting?.wrapSequencesWithNewlines).toBe(true);
        expect(preset.formatting?.sequencesAsStopStrings).toBeUndefined();
    });

    test("preserves explicit false formatting flags and newline aliases", () => {
        expect(
            normalizePreset({
                formatting: {
                    collapseConsecutiveNewlines: false,
                    namesAsStopStrings: false,
                },
            }).formatting,
        ).toMatchObject({
            collapseConsecutiveNewlines: false,
            namesAsStopStrings: false,
        });

        const { preset } = importSillyTavernPreset(
            {
                instruct: { collapse_consecutive_newlines: false },
                names_as_stop: false,
            },
            "False flags",
        );
        expect(preset.formatting).toMatchObject({
            collapseConsecutiveNewlines: false,
            namesAsStopStrings: false,
        });
    });
});
