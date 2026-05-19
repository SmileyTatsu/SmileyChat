import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { asString, normalizeArray, normalizeUpdatedAt } from "../common/normalize";
import { defaultLorebookSettings } from "./defaults";
import type {
    Lorebook,
    LorebookCollection,
    LorebookEntry,
    LorebookGenerationTrigger,
    LorebookImportMetadata,
    LorebookIndex,
    LorebookInsertionPosition,
    LorebookSettings,
    LorebookSummary,
} from "./types";

export function normalizeLorebook(value: unknown): Lorebook | undefined {
    const source = isRecord(value) ? value : {};
    const now = new Date().toISOString();
    const title = asString(source.title).trim() || asString(source.name).trim();

    if (!title && !Array.isArray(source.entries)) {
        return undefined;
    }

    return {
        id: asString(source.id) || createId("lorebook"),
        version: 1,
        title: title || "Untitled lorebook",
        description: asString(source.description),
        settings: normalizeLorebookSettings(source.settings),
        entries: normalizeArray(source.entries, normalizeLorebookEntry),
        ...(normalizeImportedFrom(source.importedFrom)
            ? { importedFrom: normalizeImportedFrom(source.importedFrom) }
            : {}),
        ...(isRecord(source.metadata) ? { metadata: { ...source.metadata } } : {}),
        ...(isRecord(source.extensions) ? { extensions: { ...source.extensions } } : {}),
        createdAt: asIsoString(source.createdAt) || now,
        updatedAt: asIsoString(source.updatedAt) || now,
    };
}

export function lorebookToSummary(lorebook: Lorebook): LorebookSummary {
    return {
        id: lorebook.id,
        title: lorebook.title,
        description: lorebook.description,
        enabled: isLorebookEnabled(lorebook),
        entryCount: lorebook.entries.length,
        enabledEntryCount: lorebook.entries.filter((entry) => entry.enabled).length,
        ...(lorebook.importedFrom ? { importedFrom: lorebook.importedFrom } : {}),
        updatedAt: lorebook.updatedAt,
    };
}

export function normalizeLorebookCollection(value: unknown): LorebookCollection {
    const source = isRecord(value) ? value : {};
    const lorebooks = normalizeArray(source.lorebooks, normalizeLorebookSummary);
    const activeLorebookId = lorebooks.some(
        (lorebook) => lorebook.id === source.activeLorebookId,
    )
        ? asString(source.activeLorebookId)
        : (lorebooks[0]?.id ?? "");

    return {
        version: 1,
        activeLorebookId,
        lorebooks,
    };
}

export function normalizeLorebookIndex(value: unknown): LorebookIndex {
    const source = isRecord(value) ? value : {};
    const lorebookIds = Array.isArray(source.lorebookIds)
        ? Array.from(
              new Set(
                  source.lorebookIds.filter(
                      (item): item is string => typeof item === "string",
                  ),
              ),
          )
        : [];
    const activeLorebookId = lorebookIds.includes(asString(source.activeLorebookId))
        ? asString(source.activeLorebookId)
        : (lorebookIds[0] ?? "");

    return {
        version: 1,
        activeLorebookId,
        lorebookIds,
    };
}

function normalizeLorebookSummary(value: unknown): LorebookSummary | undefined {
    const source = isRecord(value) ? value : {};
    const id = asString(source.id);
    const title = asString(source.title).trim();

    if (!id || !title) {
        return undefined;
    }

    return {
        id,
        title,
        description: asString(source.description),
        enabled: source.enabled !== false,
        entryCount: nonNegativeInteger(source.entryCount),
        enabledEntryCount: nonNegativeInteger(source.enabledEntryCount),
        ...(normalizeImportedFrom(source.importedFrom)
            ? { importedFrom: normalizeImportedFrom(source.importedFrom) }
            : {}),
        updatedAt: normalizeUpdatedAt(source.updatedAt),
    };
}

export function isLorebookEnabled(
    lorebook: Pick<Lorebook, "metadata"> | Pick<LorebookSummary, "enabled">,
) {
    if ("enabled" in lorebook) {
        return lorebook.enabled !== false;
    }

    return lorebook.metadata?.enabled !== false;
}

function normalizeLorebookSettings(value: unknown): LorebookSettings {
    const source = isRecord(value) ? value : {};
    const tokenBudget = isRecord(source.tokenBudget) ? source.tokenBudget : {};

    return {
        scanDepth: positiveInteger(source.scanDepth, defaultLorebookSettings.scanDepth),
        tokenBudget: {
            mode: tokenBudget.mode === "tokens" ? "tokens" : "percent",
            value: positiveInteger(
                tokenBudget.value,
                defaultLorebookSettings.tokenBudget.value,
            ),
        },
        includeNames: source.includeNames !== false,
        recursive: source.recursive === true,
        maxRecursionSteps: positiveInteger(source.maxRecursionSteps, 2),
        minActivations: nonNegativeInteger(source.minActivations),
        minActivationsMaxDepth: nonNegativeInteger(source.minActivationsMaxDepth),
        caseSensitive: source.caseSensitive === true,
        matchWholeWords: source.matchWholeWords === true,
        useGroupScoring: source.useGroupScoring === true,
        insertionStrategy: normalizeInsertionStrategy(source.insertionStrategy),
        overflowAlert: source.overflowAlert !== false,
    };
}

function normalizeLorebookEntry(value: unknown): LorebookEntry | undefined {
    const source = isRecord(value) ? value : {};
    const content = asString(source.content);
    const keys = stringArray(source.keys);
    const title =
        asString(source.title).trim() ||
        asString(source.comment).trim() ||
        asString(source.name).trim() ||
        keys[0] ||
        "Untitled entry";

    if (!content && keys.length === 0 && source.constant !== true) {
        return undefined;
    }

    return {
        id: asString(source.id) || createId("lore-entry"),
        uid: optionalNumber(source.uid),
        enabled: source.enabled !== false && source.disable !== true,
        title,
        keys,
        secondaryKeys: stringArray(source.secondaryKeys),
        selectiveLogic: normalizeSelectiveLogic(source.selectiveLogic),
        content,
        strategy: normalizeStrategy(source.strategy, source.constant),
        insertionOrder: integer(source.insertionOrder, 100),
        position: normalizePosition(source.position),
        role: normalizeRole(source.role),
        depth: nonNegativeInteger(source.depth),
        outletName: asString(source.outletName),
        probability: numberInRange(source.probability, 0, 100, 100),
        useProbability: source.useProbability === true,
        inclusionGroups: stringArray(source.inclusionGroups),
        groupWeight: integer(source.groupWeight, 100),
        prioritizeInclusion: source.prioritizeInclusion === true,
        ...(typeof source.useGroupScoring === "boolean"
            ? { useGroupScoring: source.useGroupScoring }
            : {}),
        scanDepth: optionalNumber(source.scanDepth),
        ...(typeof source.caseSensitive === "boolean"
            ? { caseSensitive: source.caseSensitive }
            : {}),
        ...(typeof source.matchWholeWords === "boolean"
            ? { matchWholeWords: source.matchWholeWords }
            : {}),
        recursive: normalizeRecursive(source.recursive),
        matchSources: normalizeMatchSources(source.matchSources),
        timedEffects: normalizeTimedEffects(source.timedEffects),
        characterFilter: normalizeCharacterFilter(source.characterFilter),
        triggers: normalizeTriggers(source.triggers),
        automationId: asString(source.automationId),
        ignoreBudget: source.ignoreBudget === true,
        extensions: isRecord(source.extensions) ? { ...source.extensions } : {},
    };
}

function normalizeImportedFrom(value: unknown): LorebookImportMetadata | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    if (value.format !== "smiley" && value.format !== "sillytavern") {
        return undefined;
    }

    return {
        format: value.format,
        importedAt: asString(value.importedAt) || undefined,
        sourceFileName: asString(value.sourceFileName) || undefined,
    };
}

function normalizeInsertionStrategy(
    value: unknown,
): LorebookSettings["insertionStrategy"] {
    return value === "character-first" || value === "global-first"
        ? value
        : "sorted-evenly";
}

function normalizeSelectiveLogic(value: unknown): LorebookEntry["selectiveLogic"] {
    switch (value) {
        case "and-all":
        case "not-any":
        case "not-all":
            return value;
        default:
            return "and-any";
    }
}

function normalizeStrategy(value: unknown, constant: unknown): LorebookEntry["strategy"] {
    if (value === "vectorized") {
        return "vectorized";
    }

    return value === "constant" || constant === true ? "constant" : "keyword";
}

function normalizePosition(value: unknown): LorebookInsertionPosition {
    switch (value) {
        case "before-char":
        case "before-examples":
        case "after-examples":
        case "author-note-top":
        case "author-note-bottom":
        case "at-depth":
        case "outlet":
            return value;
        default:
            return "after-char";
    }
}

function normalizeRole(value: unknown): LorebookEntry["role"] {
    return value === "user" || value === "assistant" ? value : "system";
}

function normalizeRecursive(value: unknown): LorebookEntry["recursive"] {
    const source = isRecord(value) ? value : {};

    return {
        exclude: source.exclude === true,
        preventFurther: source.preventFurther === true,
        delayUntilRecursion: nonNegativeInteger(source.delayUntilRecursion),
    };
}

function normalizeMatchSources(value: unknown): LorebookEntry["matchSources"] {
    const source = isRecord(value) ? value : {};

    return {
        personaDescription: source.personaDescription === true,
        characterDescription: source.characterDescription === true,
        characterPersonality: source.characterPersonality === true,
        characterNotes: source.characterNotes === true,
        scenario: source.scenario === true,
        creatorNotes: source.creatorNotes === true,
    };
}

function normalizeTimedEffects(value: unknown): LorebookEntry["timedEffects"] {
    const source = isRecord(value) ? value : {};

    return {
        sticky: nonNegativeInteger(source.sticky),
        cooldown: nonNegativeInteger(source.cooldown),
        delay: nonNegativeInteger(source.delay),
    };
}

function normalizeCharacterFilter(value: unknown): LorebookEntry["characterFilter"] {
    const source = isRecord(value) ? value : {};

    return {
        mode: source.mode === "exclude" ? "exclude" : "include",
        names: stringArray(source.names),
        tags: stringArray(source.tags),
    };
}

function normalizeTriggers(value: unknown): LorebookGenerationTrigger[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is LorebookGenerationTrigger =>
        ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"].includes(
            String(item),
        ),
    );
}

function stringArray(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function asIsoString(value: unknown) {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";
}

function positiveInteger(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : fallback;
}

function nonNegativeInteger(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function integer(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback;
}
