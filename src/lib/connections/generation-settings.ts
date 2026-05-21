import type { PresetGenerationSettings } from "../presets/types";

export function stopSequencesForGeneration(
    generation: PresetGenerationSettings | undefined,
) {
    const stopSequences = generation?.stopSequences?.filter(Boolean) ?? [];
    return stopSequences.length ? stopSequences : undefined;
}

export function isClaudeOpus47OrLaterModel(modelId: string) {
    return /^claude-opus-4-(?:[7-9]|\d{2,})(?:\b|-)/i.test(modelId);
}

export function isClaudeOpus41Model(modelId: string) {
    return /^claude-opus-4-1(?:\b|-)/i.test(modelId);
}

export function isGoogleAITopKSupported(model: { topK?: number } | undefined) {
    return !model || typeof model.topK === "number";
}

export function filterOpenRouterGenerationParameters(
    generation: PresetGenerationSettings | undefined,
    supportedParameters?: string[] | null,
) {
    if (!generation) {
        return undefined;
    }

    if (!supportedParameters?.length) {
        return generation;
    }

    const supported = new Set(supportedParameters);
    const output: PresetGenerationSettings = {};

    copyIfSupported(output, generation, "temperature", supported, "temperature");
    copyIfSupported(output, generation, "topP", supported, "top_p");
    copyIfSupported(output, generation, "topK", supported, "top_k");
    copyIfSupported(output, generation, "minP", supported, "min_p");
    copyIfSupported(output, generation, "topA", supported, "top_a");
    copyIfSupported(output, generation, "presencePenalty", supported, "presence_penalty");
    copyIfSupported(
        output,
        generation,
        "frequencyPenalty",
        supported,
        "frequency_penalty",
    );
    copyIfSupported(
        output,
        generation,
        "repetitionPenalty",
        supported,
        "repetition_penalty",
    );
    copyIfSupported(output, generation, "seed", supported, "seed");
    copyIfSupported(output, generation, "stopSequences", supported, "stop");

    return Object.keys(output).length ? output : undefined;
}

function copyIfSupported<K extends keyof PresetGenerationSettings>(
    output: PresetGenerationSettings,
    source: PresetGenerationSettings,
    key: K,
    supported: Set<string>,
    supportedKey: string,
) {
    if (source[key] === undefined || !supported.has(supportedKey)) {
        return;
    }

    output[key] = source[key] as never;
}
