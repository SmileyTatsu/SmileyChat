import { normalizeStringList } from "../connections/config-utils";
import { isRecord } from "../common/guards";
import type { PresetGenerationSettings } from "./types";

export const defaultPresetGenerationSettings: PresetGenerationSettings = {
    frequencyPenalty: 0,
    presencePenalty: 0,
    repetitionPenalty: 1,
    temperature: 1,
    topP: 1,
};

export const sillyTavernGenerationFieldMap = {
    frequency_penalty: "frequencyPenalty",
    min_p: "minP",
    presence_penalty: "presencePenalty",
    repetition_penalty: "repetitionPenalty",
    seed: "seed",
    stop: "stopSequences",
    stop_sequence: "stopSequences",
    stop_sequences: "stopSequences",
    temperature: "temperature",
    top_a: "topA",
    top_k: "topK",
    top_p: "topP",
} as const;

export function normalizePresetGenerationSettings(
    value: unknown,
): PresetGenerationSettings | undefined {
    const source = isRecord(value) ? value : {};
    const output: PresetGenerationSettings = {};

    assignNumber(output, "temperature", source.temperature, 0, 2);
    assignNumber(output, "topP", source.topP, 0, 1);
    assignInteger(output, "topK", source.topK, 0);
    assignNumber(output, "minP", source.minP, 0, 1);
    assignNumber(output, "topA", source.topA, 0, 1);
    assignNumber(output, "presencePenalty", source.presencePenalty, -2, 2);
    assignNumber(output, "frequencyPenalty", source.frequencyPenalty, -2, 2);
    assignNumber(output, "repetitionPenalty", source.repetitionPenalty, 0, 2);
    assignInteger(output, "seed", source.seed);

    const stopSequences = normalizeStringList(source.stopSequences);
    if (stopSequences.length) {
        output.stopSequences = stopSequences;
    }

    return {
        ...defaultPresetGenerationSettings,
        ...output,
    };
}

export function normalizeSillyTavernGenerationSettings(value: unknown): {
    generation?: PresetGenerationSettings;
    importedFields: string[];
} {
    const source = isRecord(value) ? value : {};
    const raw: Record<string, unknown> = {};
    const importedFields: string[] = [];

    for (const [sourceField, targetField] of Object.entries(
        sillyTavernGenerationFieldMap,
    )) {
        if (!(sourceField in source)) {
            continue;
        }

        raw[targetField] = source[sourceField];
        importedFields.push(sourceField);
    }

    return {
        generation: importedFields.length
            ? normalizePresetGenerationSettings(raw)
            : undefined,
        importedFields,
    };
}

type NumberGenerationSetting = Exclude<keyof PresetGenerationSettings, "stopSequences">;

function assignNumber(
    output: PresetGenerationSettings,
    key: NumberGenerationSetting,
    value: unknown,
    minimum: number,
    maximum: number,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
    }

    output[key] = Math.min(maximum, Math.max(minimum, value)) as never;
}

function assignInteger(
    output: PresetGenerationSettings,
    key: NumberGenerationSetting,
    value: unknown,
    minimum?: number,
) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        return;
    }

    output[key] = (
        typeof minimum === "number" ? Math.max(minimum, value) : value
    ) as never;
}
