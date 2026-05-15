import { isRecord } from "../common/guards";
import { createId } from "../common/ids";

import { createDefaultPreset, defaultPresetCollection } from "./defaults";
import type {
    PresetCollection,
    PresetInjectionPosition,
    PresetPrompt,
    PresetPromptOrderEntry,
    PresetPromptRole,
    SillyTavernImportSummary,
    ScyllaPreset,
} from "./types";

type NormalizedPromptEntry = {
    prompt: PresetPrompt;
    sourceEnabled: boolean;
    sourceId: string;
};

const ignoredSillyTavernFields = [
    "temperature",
    "frequency_penalty",
    "presence_penalty",
    "top_p",
    "top_k",
    "top_a",
    "min_p",
    "repetition_penalty",
    "openai_max_context",
    "openai_max_tokens",
    "max_context_unlocked",
    "stream_openai",
    "reasoning_effort",
    "seed",
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

export function normalizePreset(value: unknown): ScyllaPreset {
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
        createdAt: stringOrFallback(preset.createdAt, now),
        updatedAt: stringOrFallback(preset.updatedAt, now),
    };
}

export function importSillyTavernPreset(
    value: unknown,
    fallbackTitle: string,
): { preset: ScyllaPreset; summary: SillyTavernImportSummary } {
    const now = new Date().toISOString();
    const source = isRecord(value) ? value : {};
    const sourcePrompts = Array.isArray(source.prompts) ? source.prompts : [];
    const promptEntries = dedupePromptEntries(
        sourcePrompts.map((prompt, index) => ({
            prompt: normalizeSillyTavernPrompt(prompt, index),
            sourceEnabled: sourcePromptEnabled(prompt),
            sourceId: sourcePromptId(prompt, "identifier"),
        })),
    );
    const prompts = promptEntries.map((entry) => entry.prompt);
    const promptIds = new Set(prompts.map((prompt) => prompt.id));
    const promptIdRewriteMap = promptIdMapFromEntries(promptEntries);
    const sourceOrder = selectSillyTavernPromptOrder(source.prompt_order);
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
        title: stringOrFallback(source.name, fallbackTitle),
        prompts,
        promptOrder,
        createdAt: now,
        updatedAt: now,
    });

    return {
        preset,
        summary: {
            importedPrompts: preset.prompts.length,
            orderedPrompts: preset.promptOrder.length,
            enabledPrompts: preset.promptOrder.filter((entry) => entry.enabled).length,
            ignoredFields: ignoredSillyTavernFields.filter((field) => field in source),
        },
    };
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
    };
}

export function createPresetFromDefault(title = "New preset"): ScyllaPreset {
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

    let selected: unknown[] = [];

    for (const candidate of value) {
        if (!isRecord(candidate) || !Array.isArray(candidate.order)) {
            continue;
        }

        if (candidate.order.length >= selected.length) {
            selected = candidate.order;
        }
    }

    return selected;
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

function stringOrFallback(value: unknown, fallback: string) {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
