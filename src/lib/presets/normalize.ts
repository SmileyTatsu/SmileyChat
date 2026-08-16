import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { normalizeStringList } from "../connections/config-utils";

import { createDefaultPreset, defaultPresetCollection } from "./defaults";
import {
    normalizePresetGenerationSettings,
    normalizeSillyTavernGenerationSettings,
    sillyTavernGenerationFieldMap,
} from "./generation";
import type {
    PresetCollection,
    PresetInjectionPosition,
    PresetPromptAnchor,
    PresetPrompt,
    PresetPromptOrderEntry,
    PresetPromptRole,
    PresetFormattingSettings,
    SillyTavernImportSummary,
    SmileyPreset,
} from "./types";

type NormalizedPromptEntry = {
    prompt: PresetPrompt;
    sourceEnabled: boolean;
    sourceId: string;
};

const ignoredSillyTavernFields = [
    "max_tokens",
    "openai_max_context",
    "openai_max_tokens",
    "max_context_unlocked",
    "reasoning_effort",
    "n",
    "enable_web_search",
    "request_images",
    "image_inlining",
    "video_inlining",
    "function_calling",
];

export function normalizePresetCollection(value: unknown): PresetCollection {
    const collection = isRecord(value) ? value : {};
    const rawPresets = Array.isArray(collection.presets)
        ? collection.presets.map(normalizePreset)
        : [];
    const seenPresetIds = new Set<string>();
    const presets = rawPresets.map((preset) => {
        if (!seenPresetIds.has(preset.id)) {
            seenPresetIds.add(preset.id);
            return preset;
        }

        const id = uniqueId("preset", seenPresetIds);
        seenPresetIds.add(id);

        return {
            ...preset,
            id,
        };
    });

    if (presets.length === 0) {
        return defaultPresetCollection;
    }

    const activePresetId =
        typeof collection.activePresetId === "string" &&
        presets.some((preset) => preset.id === collection.activePresetId)
            ? collection.activePresetId
            : presets[0].id;

    return {
        activePresetId,
        presets,
    };
}

export function normalizePreset(value: unknown): SmileyPreset {
    const now = new Date().toISOString();
    const preset = isRecord(value) ? value : {};
    const sourcePrompts = Array.isArray(preset.prompts) ? preset.prompts : [];
    const promptEntries =
        sourcePrompts.length > 0
            ? dedupePromptEntries(
                  sourcePrompts.map((prompt) => ({
                      prompt: normalizePrompt(prompt),
                      sourceEnabled: sourcePromptEnabled(prompt),
                      sourceId: sourcePromptId(prompt, "id"),
                  })),
              )
            : createDefaultPreset(now).prompts.map((prompt) => ({
                  prompt,
                  sourceEnabled: true,
                  sourceId: prompt.id,
              }));
    const prompts = promptEntries.map((entry) => entry.prompt);
    const promptIds = new Set(prompts.map((prompt) => prompt.id));
    const promptIdRewriteMap = promptIdMapFromEntries(promptEntries);
    const orderedPromptIds = new Set<string>();
    const promptOrder = Array.isArray(preset.promptOrder)
        ? preset.promptOrder
              .map(normalizeOrderEntry)
              .map((entry) => ({
                  ...entry,
                  promptId: promptIdRewriteMap.get(entry.promptId) ?? entry.promptId,
              }))
              .filter((entry) => promptIds.has(entry.promptId))
              .filter((entry) => {
                  if (orderedPromptIds.has(entry.promptId)) {
                      return false;
                  }

                  orderedPromptIds.add(entry.promptId);
                  return true;
              })
        : [];
    const orderedIds = new Set(promptOrder.map((entry) => entry.promptId));
    const generation = normalizePresetGenerationSettings(preset.generation);
    const formatting = normalizePresetFormattingSettings(preset.formatting);
    const metadata = normalizeRecord(preset.metadata);
    const extensions = normalizeRecord(preset.extensions);

    for (const { prompt, sourceEnabled } of promptEntries) {
        if (!orderedIds.has(prompt.id)) {
            promptOrder.push({
                promptId: prompt.id,
                enabled: sourceEnabled,
            });
        }
    }

    return {
        id: stringOrFallback(preset.id, createId("preset")),
        title: stringOrFallback(preset.title, "Untitled preset"),
        prompts,
        promptOrder,
        ...(generation ? { generation } : {}),
        ...(formatting ? { formatting } : {}),
        ...(metadata ? { metadata } : {}),
        ...(extensions ? { extensions } : {}),
        createdAt: stringOrFallback(preset.createdAt, now),
        updatedAt: stringOrFallback(preset.updatedAt, now),
    };
}

export function importSillyTavernPreset(
    value: unknown,
    fallbackTitle: string,
): { preset: SmileyPreset; summary: SillyTavernImportSummary } {
    const now = new Date().toISOString();
    const source = isRecord(value) ? value : {};
    const instruct = isRecord(source.instruct) ? source.instruct : {};
    const context = isRecord(source.context) ? source.context : {};
    const presetSub = isRecord(source.preset) ? source.preset : {};
    const sysprompt = isRecord(source.sysprompt) ? source.sysprompt : {};

    const rawTitle =
        (typeof source.name === "string" && source.name.trim()
            ? source.name.trim()
            : undefined) ??
        (typeof presetSub.name === "string" && presetSub.name.trim()
            ? presetSub.name.trim()
            : undefined) ??
        (typeof instruct.name === "string" && instruct.name.trim()
            ? instruct.name.trim()
            : undefined) ??
        (typeof context.name === "string" && context.name.trim()
            ? context.name.trim()
            : undefined) ??
        (typeof sysprompt.name === "string" && sysprompt.name.trim()
            ? sysprompt.name.trim()
            : undefined);

    const title = rawTitle || fallbackTitle;
    const sourcePrompts = Array.isArray(source.prompts) ? source.prompts : [];
    const baseDefault = createDefaultPreset(now);
    const syspromptContent =
        typeof sysprompt.content === "string" ? sysprompt.content.trim() : "";

    const storyString =
        typeof context.story_string === "string" && context.story_string.trim()
            ? context.story_string.trim()
            : typeof source.story_string === "string" && source.story_string.trim()
              ? source.story_string.trim()
              : "";

    let promptEntries: NormalizedPromptEntry[];

    if (sourcePrompts.length > 0) {
        promptEntries = dedupePromptEntries(
            sourcePrompts.map((prompt, index) => ({
                prompt: normalizeSillyTavernPrompt(prompt, index),
                sourceEnabled: sourcePromptEnabled(prompt),
                sourceId: sourcePromptId(prompt, "identifier"),
            })),
        );
    } else if (storyString) {
        let storyContent = storyString;
        if (syspromptContent) {
            if (storyContent.includes("{{system}}")) {
                storyContent = storyContent.replace(
                    /\{\{\s*system\s*\}\}/g,
                    syspromptContent,
                );
            } else if (storyContent.includes("{{system_prompt}}")) {
                storyContent = storyContent.replace(
                    /\{\{\s*system_prompt\s*\}\}/g,
                    syspromptContent,
                );
            }
        }

        const storyPrompt: PresetPrompt = {
            id: createId("prompt"),
            title:
                typeof context.name === "string" && context.name.trim()
                    ? context.name.trim()
                    : typeof sysprompt.name === "string" && sysprompt.name.trim()
                      ? sysprompt.name.trim()
                      : "Story Context",
            role: "system",
            content: storyContent,
            systemPrompt: true,
            marker: false,
            injectionPosition: "none",
            injectionDepth: 0,
            forbidOverrides: false,
        };

        const historyPrompt: PresetPrompt = {
            id: createId("prompt"),
            title: "Chat History",
            role: "system",
            content: "{{chat_history}}",
            systemPrompt: false,
            marker: true,
            injectionPosition: "none",
            injectionDepth: 4,
            forbidOverrides: false,
            anchor: "before-history",
        };

        promptEntries = [
            { prompt: storyPrompt, sourceEnabled: true, sourceId: storyPrompt.id },
            { prompt: historyPrompt, sourceEnabled: true, sourceId: historyPrompt.id },
        ];
    } else if (syspromptContent) {
        promptEntries = baseDefault.prompts.map((prompt, index) => {
            if (index === 0) {
                return {
                    prompt: {
                        ...prompt,
                        title:
                            typeof sysprompt.name === "string" && sysprompt.name.trim()
                                ? sysprompt.name.trim()
                                : "System Prompt",
                        content: syspromptContent,
                    },
                    sourceEnabled: true,
                    sourceId: prompt.id,
                };
            }
            return {
                prompt,
                sourceEnabled: true,
                sourceId: prompt.id,
            };
        });
    } else {
        promptEntries = baseDefault.prompts.map((prompt) => ({
            prompt,
            sourceEnabled: true,
            sourceId: prompt.id,
        }));
    }

    const prompts = promptEntries.map((entry) => entry.prompt);
    const promptIds = new Set(prompts.map((prompt) => prompt.id));
    const promptIdRewriteMap = promptIdMapFromEntries(promptEntries);
    const sourceOrder = selectSillyTavernPromptOrder(source.prompt_order);
    const generationImport = normalizeSillyTavernGenerationSettings(source);
    const formatting = normalizeSillyTavernFormattingSettings(source);
    const orderedPromptIds = new Set<string>();
    const promptOrder = sourceOrder
        .map((entry) => normalizeSillyTavernOrderEntry(entry))
        .map((entry) => ({
            ...entry,
            promptId: promptIdRewriteMap.get(entry.promptId) ?? entry.promptId,
        }))
        .filter((entry) => promptIds.has(entry.promptId))
        .filter((entry) => {
            if (orderedPromptIds.has(entry.promptId)) {
                return false;
            }

            orderedPromptIds.add(entry.promptId);
            return true;
        });
    const orderedIds = new Set(promptOrder.map((entry) => entry.promptId));

    for (const { prompt, sourceEnabled } of promptEntries) {
        if (!orderedIds.has(prompt.id)) {
            promptOrder.push({
                promptId: prompt.id,
                enabled: sourceEnabled,
            });
        }
    }

    const preset = normalizePreset({
        id: createId("preset"),
        title,
        prompts,
        promptOrder,
        ...(generationImport.generation
            ? { generation: generationImport.generation }
            : {}),
        ...(formatting ? { formatting } : {}),
        createdAt: now,
        updatedAt: now,
    });

    return {
        preset,
        summary: {
            importedGenerationFields: generationImport.importedFields,
            importedPrompts: preset.prompts.length,
            orderedPrompts: preset.promptOrder.length,
            enabledPrompts: preset.promptOrder.filter((entry) => entry.enabled).length,
            ignoredFields: ignoredFieldsForSummary(source),
        },
    };
}

function ignoredFieldsForSummary(source: Record<string, unknown>): string[] {
    const presetSub = isRecord(source.preset) ? source.preset : {};
    return ignoredSillyTavernFields.filter(
        (field) =>
            (field in source && !(field in sillyTavernGenerationFieldMap)) ||
            (field in presetSub && !(field in sillyTavernGenerationFieldMap)),
    );
}

function normalizePresetFormattingSettings(value: unknown): PresetFormattingSettings {
    const source = isRecord(value) ? value : {};
    const template = source.instructTemplate;
    const instructTemplate: PresetFormattingSettings["instructTemplate"] =
        template === "none" ||
        template === "chatml" ||
        template === "llama3" ||
        template === "mistral" ||
        template === "gemma2" ||
        template === "alpaca" ||
        template === "deepseek-r1" ||
        template === "custom"
            ? template
            : "auto";
    const formatting = {
        ...(typeof source.namesAsStopStrings === "boolean"
            ? { namesAsStopStrings: source.namesAsStopStrings }
            : {}),
        ...(typeof source.collapseConsecutiveNewlines === "boolean"
            ? { collapseConsecutiveNewlines: source.collapseConsecutiveNewlines }
            : {}),
        ...(source.separatorsAsStopStrings === true
            ? { separatorsAsStopStrings: true }
            : {}),
        ...(source.singleLineMode === true ? { singleLineMode: true } : {}),
        ...(source.alwaysAddCharacterName === true
            ? { alwaysAddCharacterName: true }
            : {}),
        ...(source.systemSameAsUser === true ? { systemSameAsUser: true } : {}),
        ...(source.wrapSequencesWithNewlines === true
            ? { wrapSequencesWithNewlines: true }
            : {}),
        exampleSeparator: stringOrFallback(source.exampleSeparator, "***"),
        chatStartSeparator: stringOrFallback(source.chatStartSeparator, "***"),
        instructTemplate,
        ...(source.sequencesAsStopStrings === true
            ? { sequencesAsStopStrings: true }
            : {}),
        ...optionalFormattingSequences(source),
    };
    return formatting;
}

function normalizeSillyTavernFormattingSettings(
    source: Record<string, unknown>,
): PresetFormattingSettings {
    const instruct = isRecord(source.instruct) ? source.instruct : {};
    const context = isRecord(source.context) ? source.context : {};
    const sysprompt = isRecord(source.sysprompt) ? source.sysprompt : {};

    const userPrefix =
        asStringOrUndefined(instruct.userPrefix) ??
        asStringOrUndefined(instruct.user_prefix) ??
        asStringOrUndefined(instruct.input_sequence) ??
        asStringOrUndefined(instruct.user_sequence) ??
        asStringOrUndefined(source.userPrefix) ??
        asStringOrUndefined(source.user_prefix) ??
        asStringOrUndefined(source.input_sequence);

    const userSuffix =
        asStringOrUndefined(instruct.userSuffix) ??
        asStringOrUndefined(instruct.user_suffix) ??
        asStringOrUndefined(instruct.input_suffix) ??
        asStringOrUndefined(instruct.user_sequence_suffix) ??
        asStringOrUndefined(source.userSuffix) ??
        asStringOrUndefined(source.user_suffix) ??
        asStringOrUndefined(source.input_suffix);

    const assistantPrefix =
        asStringOrUndefined(instruct.assistantPrefix) ??
        asStringOrUndefined(instruct.assistant_prefix) ??
        asStringOrUndefined(instruct.output_sequence) ??
        asStringOrUndefined(instruct.assistant_sequence) ??
        asStringOrUndefined(source.assistantPrefix) ??
        asStringOrUndefined(source.assistant_prefix) ??
        asStringOrUndefined(source.output_sequence);

    const assistantSuffix =
        asStringOrUndefined(instruct.assistantSuffix) ??
        asStringOrUndefined(instruct.assistant_suffix) ??
        asStringOrUndefined(instruct.output_suffix) ??
        asStringOrUndefined(instruct.assistant_sequence_suffix) ??
        asStringOrUndefined(source.assistantSuffix) ??
        asStringOrUndefined(source.assistant_suffix) ??
        asStringOrUndefined(source.output_suffix);

    const systemPrefix =
        asStringOrUndefined(instruct.systemPrefix) ??
        asStringOrUndefined(instruct.system_prefix) ??
        asStringOrUndefined(instruct.system_sequence) ??
        asStringOrUndefined(instruct.system_sequence_prefix) ??
        asStringOrUndefined(source.systemPrefix) ??
        asStringOrUndefined(source.system_prefix) ??
        asStringOrUndefined(source.system_sequence);

    const systemSuffix =
        asStringOrUndefined(instruct.systemSuffix) ??
        asStringOrUndefined(instruct.system_suffix) ??
        asStringOrUndefined(instruct.system_sequence_suffix) ??
        asStringOrUndefined(instruct.system_suffix) ??
        asStringOrUndefined(source.systemSuffix) ??
        asStringOrUndefined(source.system_suffix);

    const storyString =
        asStringOrUndefined(context.story_string) ??
        asStringOrUndefined(context.storyString) ??
        asStringOrUndefined(instruct.story_string) ??
        asStringOrUndefined(instruct.storyString) ??
        asStringOrUndefined(source.story_string) ??
        asStringOrUndefined(source.storyString);

    const storyStringPrefix =
        asStringOrUndefined(instruct.story_string_prefix) ??
        asStringOrUndefined(instruct.storyStringPrefix) ??
        asStringOrUndefined(source.story_string_prefix) ??
        asStringOrUndefined(source.storyStringPrefix);

    const storyStringSuffix =
        asStringOrUndefined(instruct.story_string_suffix) ??
        asStringOrUndefined(instruct.storyStringSuffix) ??
        asStringOrUndefined(source.story_string_suffix) ??
        asStringOrUndefined(source.storyStringSuffix);

    const overridePresetPromptOrder =
        instruct.overridePresetPromptOrder === true ||
        instruct.override_preset_prompt_order === true ||
        source.overridePresetPromptOrder === true ||
        source.override_preset_prompt_order === true;

    const firstInputSequence =
        asStringOrUndefined(instruct.firstInputSequence) ??
        asStringOrUndefined(instruct.first_input_sequence) ??
        asStringOrUndefined(source.firstInputSequence) ??
        asStringOrUndefined(source.first_input_sequence);

    const lastInputSequence =
        asStringOrUndefined(instruct.lastInputSequence) ??
        asStringOrUndefined(instruct.last_input_sequence) ??
        asStringOrUndefined(source.lastInputSequence) ??
        asStringOrUndefined(source.last_input_sequence);

    const firstOutputSequence =
        asStringOrUndefined(instruct.firstOutputSequence) ??
        asStringOrUndefined(instruct.first_output_sequence) ??
        asStringOrUndefined(source.firstOutputSequence) ??
        asStringOrUndefined(source.first_output_sequence);

    const lastOutputSequence =
        asStringOrUndefined(instruct.lastOutputSequence) ??
        asStringOrUndefined(instruct.last_output_sequence) ??
        asStringOrUndefined(source.lastOutputSequence) ??
        asStringOrUndefined(source.last_output_sequence);

    const userAlignmentMessage =
        asStringOrUndefined(instruct.userAlignmentMessage) ??
        asStringOrUndefined(instruct.user_alignment_message) ??
        asStringOrUndefined(source.userAlignmentMessage) ??
        asStringOrUndefined(source.user_alignment_message);

    const systemSameAsUser =
        instruct.systemSameAsUser === true ||
        instruct.system_same_as_user === true ||
        source.systemSameAsUser === true ||
        source.system_same_as_user === true;

    const systemPrompt =
        asStringOrUndefined(sysprompt.content) ??
        asStringOrUndefined(instruct.systemPrompt) ??
        asStringOrUndefined(source.systemPrompt);

    const namesAsStopStrings = firstBoolean(
        source.names_as_stop,
        source.namesAsStopStrings,
        instruct.names_as_stop,
        instruct.namesAsStopStrings,
        context.names_as_stop_strings,
    );
    const collapseConsecutiveNewlines = firstBoolean(
        instruct.collapseConsecutiveNewlines,
        instruct.collapse_consecutive_newlines,
        instruct.collapse_newlines,
        source.collapseConsecutiveNewlines,
        source.collapse_consecutive_newlines,
        source.collapse_newlines,
    );
    const namesBehavior =
        instruct.names_behavior === "none" || instruct.names_behavior === "never"
            ? "never"
            : instruct.names_behavior === "always"
              ? "always"
              : instruct.names_behavior === "force"
                ? "force"
                : undefined;

    const separatorsAsStopStrings =
        source.separators_as_stop === true || context.separators_as_stop === true;

    const singleLineMode = source.single_line === true || context.single_line === true;

    const alwaysAddCharacterName =
        source.always_force_name2 === true || context.always_force_name2 === true;

    const exampleSeparator =
        (typeof source.example_separator === "string"
            ? source.example_separator
            : undefined) ??
        (typeof context.example_separator === "string"
            ? context.example_separator
            : undefined);

    const chatStartSeparator =
        (typeof source.chat_start === "string" ? source.chat_start : undefined) ??
        (typeof context.chat_start === "string" ? context.chat_start : undefined);

    const instructTemplate =
        (typeof source.instruct_template === "string"
            ? source.instruct_template
            : undefined) ??
        (typeof instruct.instruct_template === "string"
            ? instruct.instruct_template
            : undefined) ??
        (typeof instruct.template === "string" ? instruct.template : undefined);

    const sequencesAsStopStrings =
        source.wrap_sequences_as_stop === true ||
        source.sequences_as_stop === true ||
        instruct.wrap_sequences === true ||
        instruct.wrap_sequences_as_stop === true ||
        instruct.sequences_as_stop === true;
    const stopSequences = normalizeStringList(
        instruct.stop_sequence ??
            instruct.stop_sequences ??
            instruct.stopSequences ??
            source.stop_sequence ??
            source.stop_sequences ??
            source.stopSequences,
    );

    const hasAnyCustomSequences = [
        userPrefix,
        userSuffix,
        assistantPrefix,
        assistantSuffix,
        systemPrefix,
        systemSuffix,
        storyString,
        firstInputSequence,
        lastInputSequence,
        firstOutputSequence,
        lastOutputSequence,
        userAlignmentMessage,
    ].some((value) => value !== undefined);

    return normalizePresetFormattingSettings({
        ...(namesAsStopStrings !== undefined ? { namesAsStopStrings } : {}),
        ...(collapseConsecutiveNewlines !== undefined
            ? { collapseConsecutiveNewlines }
            : {}),
        separatorsAsStopStrings,
        singleLineMode,
        alwaysAddCharacterName,
        exampleSeparator,
        chatStartSeparator,
        instructTemplate: hasAnyCustomSequences ? "custom" : instructTemplate,
        sequencesAsStopStrings,
        userPrefix,
        userSuffix,
        assistantPrefix,
        assistantSuffix,
        systemPrefix,
        systemSuffix,
        ...(storyString !== undefined ? { storyString } : {}),
        ...(storyStringPrefix !== undefined ? { storyStringPrefix } : {}),
        ...(storyStringSuffix !== undefined ? { storyStringSuffix } : {}),
        ...(firstInputSequence !== undefined ? { firstInputSequence } : {}),
        ...(lastInputSequence !== undefined ? { lastInputSequence } : {}),
        ...(firstOutputSequence !== undefined ? { firstOutputSequence } : {}),
        ...(lastOutputSequence !== undefined ? { lastOutputSequence } : {}),
        ...(userAlignmentMessage !== undefined ? { userAlignmentMessage } : {}),
        ...(systemSameAsUser ? { systemSameAsUser: true } : {}),
        ...(instruct.wrap === true || source.wrap === true
            ? { wrapSequencesWithNewlines: true }
            : {}),
        ...(overridePresetPromptOrder ? { overridePresetPromptOrder: true } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(stopSequences.length ? { stopSequences } : {}),
        ...(namesBehavior ? { namesBehavior } : {}),
        ...(instruct.macro === true ? { replaceMacrosInSequences: true } : {}),
        ...(instruct.skip_examples === true ? { skipExamples: true } : {}),
        ...(typeof instruct.activation_regex === "string"
            ? { activationRegex: instruct.activation_regex }
            : {}),
    });
}

function optionalFormattingSequences(source: Record<string, unknown>) {
    const keys = [
        "userPrefix",
        "userSuffix",
        "assistantPrefix",
        "assistantSuffix",
        "systemPrefix",
        "systemSuffix",
        "systemPrompt",
        "storyString",
        "storyStringPrefix",
        "storyStringSuffix",
        "firstInputSequence",
        "lastInputSequence",
        "firstOutputSequence",
        "lastOutputSequence",
        "userAlignmentMessage",
    ] as const;
    return Object.fromEntries(
        keys.flatMap((key) =>
            typeof source[key] === "string" ? [[key, source[key]]] : [],
        ),
    );
}

function firstBoolean(...values: unknown[]): boolean | undefined {
    return values.find((value): value is boolean => typeof value === "boolean");
}

export function createBlankPrompt(): PresetPrompt {
    return {
        id: createId("prompt"),
        title: "New prompt",
        role: "system",
        content: "",
        systemPrompt: true,
        marker: false,
        injectionPosition: "none",
        injectionDepth: 4,
        forbidOverrides: false,
        anchor: undefined,
    };
}

export function createPresetFromDefault(title = "New preset"): SmileyPreset {
    const now = new Date().toISOString();
    const basePreset = createDefaultPreset(now);

    return {
        ...basePreset,
        id: createId("preset"),
        title,
        prompts: basePreset.prompts.map((prompt) => ({ ...prompt })),
        promptOrder: basePreset.promptOrder.map((entry) => ({ ...entry })),
        createdAt: now,
        updatedAt: now,
    };
}

function normalizePrompt(value: unknown): PresetPrompt {
    const prompt = isRecord(value) ? value : {};
    const anchor = normalizePromptAnchor(prompt.anchor);

    return {
        id: stringOrFallback(prompt.id, createId("prompt")),
        title: stringOrFallback(prompt.title, "Untitled prompt"),
        role: normalizeRole(prompt.role),
        content: typeof prompt.content === "string" ? prompt.content : "",
        systemPrompt: prompt.systemPrompt === true,
        marker: prompt.marker === true,
        injectionPosition: normalizeInjectionPosition(prompt.injectionPosition),
        injectionDepth: numberOrFallback(prompt.injectionDepth, 4),
        forbidOverrides: prompt.forbidOverrides === true,
        ...(anchor ? { anchor } : {}),
    };
}

function normalizeOrderEntry(value: unknown): PresetPromptOrderEntry {
    const entry = isRecord(value) ? value : {};

    return {
        promptId: stringOrFallback(entry.promptId, ""),
        enabled: entry.enabled !== false,
    };
}

function normalizeSillyTavernPrompt(value: unknown, index: number): PresetPrompt {
    const prompt = isRecord(value) ? value : {};
    const anchor = normalizePromptAnchor(prompt.anchor);

    return {
        id: stringOrFallback(prompt.identifier, `prompt-${index + 1}`),
        title: stringOrFallback(prompt.name, `Prompt ${index + 1}`),
        role: normalizeRole(prompt.role),
        content: typeof prompt.content === "string" ? prompt.content : "",
        systemPrompt: prompt.system_prompt === true,
        marker: prompt.marker === true,
        injectionPosition: normalizeSillyTavernInjectionPosition(
            prompt.injection_position,
        ),
        injectionDepth: numberOrFallback(prompt.injection_depth, 4),
        forbidOverrides: prompt.forbid_overrides === true,
        ...(anchor ? { anchor } : {}),
    };
}

function normalizeSillyTavernOrderEntry(value: unknown): PresetPromptOrderEntry {
    const entry = isRecord(value) ? value : {};

    return {
        promptId: stringOrFallback(entry.identifier, ""),
        enabled: entry.enabled !== false,
    };
}

function selectSillyTavernPromptOrder(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const candidates = value.filter(
        (candidate): candidate is Record<string, unknown> =>
            isRecord(candidate) && Array.isArray(candidate.order),
    );

    const preferredCandidate =
        candidates.find((candidate) => candidate.character_id === 100001) ??
        candidates.find((candidate) => candidate.character_id === 100000) ??
        candidates.find((candidate) => typeof candidate.character_id !== "number") ??
        candidates[0];

    return Array.isArray(preferredCandidate?.order) ? preferredCandidate.order : [];
}

function normalizeRole(value: unknown): PresetPromptRole {
    if (value === "user" || value === "assistant") {
        return value;
    }

    return "system";
}

function normalizeInjectionPosition(value: unknown): PresetInjectionPosition {
    if (value === "before" || value === "after") {
        return value;
    }

    return "none";
}

function normalizeSillyTavernInjectionPosition(value: unknown): PresetInjectionPosition {
    if (value === 0) {
        return "before";
    }

    if (value === 1) {
        return "after";
    }

    return "none";
}

function normalizePromptAnchor(value: unknown): PresetPromptAnchor | undefined {
    switch (value) {
        case "after-character":
        case "after-examples":
        case "after-history":
        case "after-scenario":
        case "before-character":
        case "before-examples":
        case "before-history":
        case "before-scenario":
            return value;
        default:
            return undefined;
    }
}

function stringOrFallback(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? { ...value } : undefined;
}

function dedupePromptEntries(entries: NormalizedPromptEntry[]) {
    const seenPromptIds = new Set<string>();

    return entries.map((entry) => {
        if (!seenPromptIds.has(entry.prompt.id)) {
            seenPromptIds.add(entry.prompt.id);
            return entry;
        }

        const id = uniqueId("prompt", seenPromptIds);
        seenPromptIds.add(id);

        return {
            ...entry,
            prompt: {
                ...entry.prompt,
                id,
            },
        };
    });
}

function promptIdMapFromEntries(entries: NormalizedPromptEntry[]) {
    const idMap = new Map<string, string>();

    for (const entry of entries) {
        if (entry.sourceId && !idMap.has(entry.sourceId)) {
            idMap.set(entry.sourceId, entry.prompt.id);
        }
    }

    return idMap;
}

function sourcePromptEnabled(value: unknown) {
    return isRecord(value) ? value.enabled !== false : true;
}

function sourcePromptId(value: unknown, field: "id" | "identifier") {
    if (!isRecord(value)) {
        return "";
    }

    const id = value[field];
    return typeof id === "string" ? id : "";
}

function uniqueId(prefix: string, usedIds: Set<string>) {
    let id = createId(prefix);

    while (usedIds.has(id)) {
        id = createId(prefix);
    }

    return id;
}

function asStringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}
