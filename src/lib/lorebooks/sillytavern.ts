import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { defaultLorebookSettings } from "./defaults";
import { normalizeLorebook } from "./normalize";
import type { Lorebook, LorebookEntry } from "./types";

export function importSillyTavernLorebook(
    value: unknown,
    options: { sourceFileName?: string; title?: string } = {},
) {
    const source = isRecord(value) ? value : {};
    const entries = sillyTavernEntries(source.entries);
    const now = new Date().toISOString();
    const title =
        stringValue(source.name) ||
        options.title ||
        fileTitle(options.sourceFileName) ||
        "Imported lorebook";
    const lorebook = normalizeLorebook({
        id: createId("lorebook"),
        title,
        description: stringValue(source.description),
        settings: {
            ...defaultLorebookSettings,
            scanDepth: numberValue(source.scan_depth, defaultLorebookSettings.scanDepth),
            tokenBudget: {
                mode: "tokens",
                value: numberValue(source.token_budget, 1024),
            },
            recursive: source.recursive_scanning === true,
        },
        entries: entries.map(convertSillyTavernEntry),
        importedFrom: {
            format: "sillytavern",
            importedAt: now,
            sourceFileName: options.sourceFileName,
        },
        extensions: {
            sillytavern: source,
        },
        createdAt: now,
        updatedAt: now,
    });

    if (!lorebook) {
        throw new Error("SillyTavern World Info JSON is not a supported shape.");
    }

    return lorebook;
}

export function exportSillyTavernLorebook(lorebook: Lorebook) {
    return {
        name: lorebook.title,
        description: lorebook.description,
        scan_depth: lorebook.settings.scanDepth,
        token_budget:
            lorebook.settings.tokenBudget.mode === "tokens"
                ? lorebook.settings.tokenBudget.value
                : undefined,
        recursive_scanning: lorebook.settings.recursive,
        entries: Object.fromEntries(
            lorebook.entries.map((entry, index) => [
                String(entry.uid ?? index),
                toSillyTavernEntry(entry, index),
            ]),
        ),
    };
}

export function isSillyTavernLorebook(value: unknown) {
    return isRecord(value) && isRecord(value.entries);
}

function sillyTavernEntries(value: unknown) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!isRecord(value)) {
        return [];
    }

    return Object.entries(value)
        .map(([uid, entry]) =>
            isRecord(entry)
                ? {
                      ...entry,
                      uid: numberValue(entry.uid, Number(uid)),
                  }
                : entry,
        )
        .sort((left, right) => {
            const leftUid = isRecord(left) ? numberValue(left.uid, 0) : 0;
            const rightUid = isRecord(right) ? numberValue(right.uid, 0) : 0;

            return leftUid - rightUid;
        });
}

function convertSillyTavernEntry(value: unknown): Partial<LorebookEntry> {
    const source = isRecord(value) ? value : {};
    const role = numberValue(source.role, 0);

    return {
        id: createId("lore-entry"),
        uid: numberValue(source.uid, undefined),
        enabled: source.disable !== true,
        title:
            stringValue(source.comment) || stringArray(source.key)[0] || "Untitled entry",
        keys: stringArray(source.key),
        secondaryKeys: stringArray(source.keysecondary),
        selectiveLogic: selectiveLogicFromNumber(source.selectiveLogic),
        content: stringValue(source.content),
        strategy: source.constant === true ? "constant" : "keyword",
        insertionOrder: numberValue(source.order, 100),
        position: positionFromNumber(source.position),
        role: role === 2 ? "assistant" : role === 1 ? "user" : "system",
        depth: numberValue(source.depth, 0),
        probability: numberValue(source.probability, 100),
        useProbability: source.useProbability === true,
        inclusionGroups: stringArray(source.group).filter(Boolean),
        groupWeight: numberValue(source.groupWeight, 100),
        prioritizeInclusion: source.groupOverride === true,
        scanDepth: numberValue(source.scanDepth, undefined),
        caseSensitive: booleanOrUndefined(source.caseSensitive),
        matchWholeWords: booleanOrUndefined(source.matchWholeWords),
        recursive: {
            exclude: source.excludeRecursion === true,
            preventFurther: source.preventRecursion === true,
            delayUntilRecursion: numberValue(source.delayUntilRecursion, 0),
        },
        timedEffects: {
            sticky: numberValue(source.sticky, 0),
            cooldown: numberValue(source.cooldown, 0),
            delay: numberValue(source.delay, 0),
        },
        automationId: stringValue(source.automationId),
        ignoreBudget: source.excludeFromBudget === true,
        extensions: {
            sillytavern: source,
        },
    };
}

function toSillyTavernEntry(entry: LorebookEntry, index: number) {
    return {
        uid: entry.uid ?? index,
        key: entry.keys,
        keysecondary: entry.secondaryKeys,
        comment: entry.title,
        content: entry.content,
        constant: entry.strategy === "constant",
        vectorized: entry.strategy === "vectorized",
        selective: entry.secondaryKeys.length > 0,
        selectiveLogic: selectiveLogicToNumber(entry.selectiveLogic),
        order: entry.insertionOrder,
        position: positionToNumber(entry.position),
        disable: !entry.enabled,
        addMemo: true,
        probability: entry.probability,
        useProbability: entry.useProbability,
        depth: entry.depth,
        role: entry.role === "assistant" ? 2 : entry.role === "user" ? 1 : 0,
        group: entry.inclusionGroups.join(","),
        groupWeight: entry.groupWeight,
        groupOverride: entry.prioritizeInclusion,
        scanDepth: entry.scanDepth,
        caseSensitive: entry.caseSensitive,
        matchWholeWords: entry.matchWholeWords,
        excludeRecursion: entry.recursive.exclude,
        preventRecursion: entry.recursive.preventFurther,
        delayUntilRecursion: entry.recursive.delayUntilRecursion,
        sticky: entry.timedEffects.sticky,
        cooldown: entry.timedEffects.cooldown,
        delay: entry.timedEffects.delay,
        automationId: entry.automationId,
        excludeFromBudget: entry.ignoreBudget,
    };
}

function selectiveLogicFromNumber(value: unknown): LorebookEntry["selectiveLogic"] {
    switch (value) {
        case 1:
            return "and-all";
        case 2:
            return "not-any";
        case 3:
            return "not-all";
        default:
            return "and-any";
    }
}

function selectiveLogicToNumber(value: LorebookEntry["selectiveLogic"]) {
    switch (value) {
        case "and-all":
            return 1;
        case "not-any":
            return 2;
        case "not-all":
            return 3;
        default:
            return 0;
    }
}

function positionFromNumber(value: unknown): LorebookEntry["position"] {
    switch (value) {
        case 0:
            return "before-char";
        case 2:
            return "before-examples";
        case 3:
            return "after-examples";
        case 4:
            return "author-note-top";
        case 5:
            return "author-note-bottom";
        case 6:
            return "at-depth";
        default:
            return "after-char";
    }
}

function positionToNumber(value: LorebookEntry["position"]) {
    switch (value) {
        case "before-char":
            return 0;
        case "before-examples":
            return 2;
        case "after-examples":
            return 3;
        case "author-note-top":
            return 4;
        case "author-note-bottom":
            return 5;
        case "at-depth":
            return 6;
        default:
            return 1;
    }
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

function numberValue<TFallback extends number | undefined>(
    value: unknown,
    fallback: TFallback,
): number | TFallback {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrUndefined(value: unknown) {
    return typeof value === "boolean" ? value : undefined;
}

function fileTitle(fileName: string | undefined) {
    return fileName?.replace(/\.[^.]+$/, "").trim();
}
