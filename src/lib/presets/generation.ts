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
    freq_pen: "frequencyPenalty",
    min_p: "minP",
    presence_penalty: "presencePenalty",
    presence_pen: "presencePenalty",
    repetition_penalty: "repetitionPenalty",
    rep_pen: "repetitionPenalty",
    rep_pen_range: "repetitionPenaltyRange",
    rep_pen_size: "repetitionPenaltyRange",
    dry_multiplier: "dryMultiplier",
    dry_base: "dryBase",
    dry_allowed_length: "dryAllowedLength",
    dry_penalty_last_n: "dryPenaltyLastN",
    dry_sequence_breakers: "drySequenceBreakers",
    xtc_threshold: "xtcThreshold",
    xtc_probability: "xtcProbability",
    mirostat: "mirostatMode",
    mirostat_mode: "mirostatMode",
    mirostat_tau: "mirostatTau",
    mirostat_eta: "mirostatEta",
    sampler_order: "samplerOrder",
    seed: "seed",
    stop: "stopSequences",
    stop_sequence: "stopSequences",
    stop_sequences: "stopSequences",
    stream: "streaming",
    stream_openai: "streaming",
    temperature: "temperature",
    temp: "temperature",
    top_a: "topA",
    top_k: "topK",
    top_p: "topP",
    typical_p: "typicalP",
    typical: "typicalP",
    tfs: "tfs",
    tfs_z: "tfs",
} as const;

export function normalizePresetGenerationSettings(
    value: unknown,
): PresetGenerationSettings | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const source = value;
    const output: PresetGenerationSettings = {};

    assignBoolean(output, "streaming", source.streaming);
    assignNumber(output, "temperature", source.temperature, 0, 2);
    assignNumber(output, "topP", source.topP, 0, 1);
    assignInteger(output, "topK", source.topK, 0);
    assignNumber(output, "minP", source.minP, 0, 1);
    assignNumber(output, "topA", source.topA, 0, 1);
    assignNumber(output, "presencePenalty", source.presencePenalty, -2, 2);
    assignNumber(output, "frequencyPenalty", source.frequencyPenalty, -2, 2);
    assignNumber(output, "repetitionPenalty", source.repetitionPenalty, 0, 2);
    assignNumber(
        output,
        "repetitionPenaltyRange",
        source.repetitionPenaltyRange,
        0,
        32768,
    );
    assignNumber(output, "dryMultiplier", source.dryMultiplier, 0, 10);
    assignNumber(output, "dryBase", source.dryBase, 1, 10);
    assignInteger(output, "dryAllowedLength", source.dryAllowedLength, 0);
    assignInteger(output, "dryPenaltyLastN", source.dryPenaltyLastN, 0);
    const drySequenceBreakers = normalizeStringList(source.drySequenceBreakers);
    if (drySequenceBreakers.length) output.drySequenceBreakers = drySequenceBreakers;
    assignNumber(output, "xtcThreshold", source.xtcThreshold, 0, 1);
    assignNumber(output, "xtcProbability", source.xtcProbability, 0, 1);
    assignInteger(output, "mirostatMode", source.mirostatMode, 0);
    assignNumber(output, "mirostatTau", source.mirostatTau, 0, 10);
    assignNumber(output, "mirostatEta", source.mirostatEta, 0, 10);
    assignNumber(output, "typicalP", source.typicalP, 0, 1);
    assignNumber(output, "tfs", source.tfs, 0, 1);
    const samplerOrder = normalizeSamplerOrder(source.samplerOrder);
    if (samplerOrder?.length) output.samplerOrder = samplerOrder;
    assignInteger(output, "seed", source.seed);

    const stopSequences = normalizeStringList(source.stopSequences);
    if (stopSequences.length) {
        output.stopSequences = stopSequences;
    }

    return Object.keys(output).length ? output : undefined;
}

export function normalizeSamplerOrder(value: unknown): number[] | undefined {
    if (Array.isArray(value)) {
        const numbers = value
            .map((item) => (typeof item === "number" ? item : Number(item)))
            .filter((item) => Number.isInteger(item));
        return numbers.length ? numbers : undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                return normalizeSamplerOrder(parsed);
            } catch {
                // ignore
            }
        }
        const numbers = trimmed
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isInteger(item));
        return numbers.length ? numbers : undefined;
    }
    return undefined;
}

export function resolvePresetStreaming(
    generation: PresetGenerationSettings | undefined,
    fallback: boolean,
) {
    return typeof generation?.streaming === "boolean" ? generation.streaming : fallback;
}

export function normalizeSillyTavernGenerationSettings(value: unknown): {
    generation?: PresetGenerationSettings;
    importedFields: string[];
} {
    const source = isRecord(value) ? value : {};
    const presetSub = isRecord(source.preset) ? source.preset : {};
    const raw: Record<string, unknown> = {};
    const importedFields: string[] = [];

    for (const [sourceField, targetField] of Object.entries(
        sillyTavernGenerationFieldMap,
    )) {
        if (sourceField in source) {
            raw[targetField] = source[sourceField];
            importedFields.push(sourceField);
        } else if (sourceField in presetSub) {
            raw[targetField] = presetSub[sourceField];
            importedFields.push(sourceField);
        }
    }

    return {
        generation: importedFields.length
            ? normalizePresetGenerationSettings(raw)
            : undefined,
        importedFields,
    };
}

type NumberGenerationSetting = Exclude<
    keyof PresetGenerationSettings,
    "stopSequences" | "streaming" | "samplerOrder" | "drySequenceBreakers"
>;

function assignBoolean(
    output: PresetGenerationSettings,
    key: "streaming",
    value: unknown,
) {
    if (typeof value === "boolean") {
        output[key] = value;
    }
}

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
