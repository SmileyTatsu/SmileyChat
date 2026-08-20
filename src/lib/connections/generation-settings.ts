import type {
    PresetFormattingSettings,
    PresetGenerationSettings,
} from "../presets/types";

export function defaultStopTokensForModel(modelId: string): string[] {
    const model = modelId.trim().toLowerCase();
    if (/(^|[/:_-])llama[- ]?3/.test(model)) return ["<|eot_id|>", "<|end_of_text|>"];
    if (/qwen|chatml/.test(model)) return ["<|im_end|>", "<|endoftext|>"];
    if (/deepseek/.test(model)) return ["<｜end_of_sentence｜>", "<|end_of_sentence|>"];
    if (/mistral|mixtral/.test(model)) return ["</s>", "[/INST]"];
    return [];
}

export function resolveEffectiveStopSequences({
    generation,
    formatting,
    characterName,
    personaName,
    groupMemberNames = [],
    modelId = "",
}: {
    generation?: PresetGenerationSettings;
    formatting?: PresetFormattingSettings;
    characterName?: string;
    personaName?: string;
    groupMemberNames?: string[];
    modelId?: string;
}) {
    const stops = new Set(generation?.stopSequences?.filter(Boolean) ?? []);
    if (formatting?.singleLineMode) {
        stops.add("\n");
        stops.add("\n\n");
    }
    if (formatting?.namesAsStopStrings) {
        [personaName, characterName, ...groupMemberNames]
            .filter((name): name is string => Boolean(name?.trim()))
            .forEach((name) => stops.add(`\n${name.trim()}:`));
        stops.add("\nUser:");
        stops.add("\n{{user}}:");
    }
    if (formatting?.separatorsAsStopStrings)
        [formatting.exampleSeparator, formatting.chatStartSeparator]
            .filter((item): item is string => Boolean(item?.trim()))
            .forEach((item) => stops.add(item.trim()));
    if (formatting?.sequencesAsStopStrings) {
        [
            formatting.userPrefix,
            formatting.userSuffix,
            formatting.assistantPrefix,
            formatting.assistantSuffix,
            formatting.systemPrefix,
            formatting.systemSuffix,
            formatting.firstInputSequence,
            formatting.lastInputSequence,
            formatting.firstOutputSequence,
            formatting.lastOutputSequence,
            formatting.storyStringPrefix,
            formatting.storyStringSuffix,
        ]
            .filter((item): item is string => Boolean(item?.trim()))
            .forEach((item) => stops.add(item.trim()));
    }
    if (formatting?.instructTemplate === "auto")
        defaultStopTokensForModel(modelId).forEach((token) => stops.add(token));
    return stops.size ? [...stops] : undefined;
}

export function stopSequencesForGeneration(
    generation: PresetGenerationSettings | undefined,
) {
    const stopSequences = generation?.stopSequences?.filter(Boolean) ?? [];
    return stopSequences.length ? stopSequences : undefined;
}

export function isPostOpus46AnthropicModel(modelId: string) {
    if (!modelId) {
        return false;
    }

    // Major version 5 or higher (e.g. claude-opus-5, claude-sonnet-5, claude-fable-5)
    if (/(?:^|[\/-])claude-[a-z]+-(?:[5-9]|\d{2,})(?:\b|-)/i.test(modelId)) {
        return true;
    }

    // Major version 4, minor version 7 or higher (e.g. claude-opus-4-7, claude-opus-4-8)
    if (/(?:^|[\/-])claude-[a-z]+-4-(?:[7-9]|\d{2,})(?:\b|-)/i.test(modelId)) {
        return true;
    }

    // Version 4.6 for non-opus families released after Opus 4.6 (e.g. claude-sonnet-4-6, claude-fable-4-6, claude-haiku-4-6)
    if (/(?:^|[\/-])claude-(?!opus\b)[a-z]+-4-6(?:\b|-)/i.test(modelId)) {
        return true;
    }

    return false;
}

export function isClaudeOpus47OrLaterModel(modelId: string) {
    return isPostOpus46AnthropicModel(modelId);
}

export function isClaudeOpus41Model(modelId: string) {
    return /^claude-opus-4-1(?:\b|-)/i.test(modelId);
}
