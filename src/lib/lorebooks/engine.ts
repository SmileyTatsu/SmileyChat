import type { Message } from "#frontend/types";

import { getMessageContent } from "../messages";
import { getPromptEligibleMessages } from "../prompt/message-utils";
import type {
    PromptAnchor,
    PromptGenerationContext,
    PromptInjection,
} from "../prompt/types";
import type { Lorebook, LorebookEntry } from "./types";

export type LorebookActivationContext = {
    generation: PromptGenerationContext;
    messages: Message[];
    resolveContent?: (content: string) => string;
};

export function createLorebookPromptInjections(
    lorebooks: Lorebook[],
    context: LorebookActivationContext,
): PromptInjection[] {
    return lorebooks.flatMap((lorebook) =>
        activeEntriesForLorebook(lorebook, context).map((entry) =>
            entryToPromptInjection(lorebook, entry, context),
        ),
    );
}

export function activeEntriesForLorebook(
    lorebook: Lorebook,
    context: LorebookActivationContext,
) {
    return lorebook.entries
        .filter((entry) => entry.enabled)
        .filter((entry) => triggerAllowsEntry(entry, context.generation))
        .filter((entry) => probabilityAllowsEntry(entry))
        .filter(
            (entry) =>
                entry.strategy === "constant" || entryMatches(entry, lorebook, context),
        )
        .sort(
            (left, right) =>
                left.insertionOrder - right.insertionOrder ||
                left.title.localeCompare(right.title) ||
                left.id.localeCompare(right.id),
        );
}

function entryToPromptInjection(
    lorebook: Lorebook,
    entry: LorebookEntry,
    context: LorebookActivationContext,
): PromptInjection {
    return {
        id: `lorebook:${lorebook.id}:${entry.id}`,
        source: "lorebook",
        role: entry.role,
        content: context.resolveContent
            ? context.resolveContent(entry.content)
            : entry.content,
        anchor: anchorForEntry(entry),
        depth: entry.position === "at-depth" ? entry.depth : undefined,
        order: entry.insertionOrder,
        outletName: entry.position === "outlet" ? entry.outletName : undefined,
        tokenBudgetBehavior: entry.ignoreBudget ? "ignore-budget" : "counted",
        metadata: {
            entryId: entry.id,
            lorebookId: lorebook.id,
            lorebookTitle: lorebook.title,
            title: entry.title,
        },
    };
}

function entryMatches(
    entry: LorebookEntry,
    lorebook: Lorebook,
    context: LorebookActivationContext,
) {
    if (entry.strategy === "vectorized") {
        return false;
    }

    if (entry.keys.length === 0) {
        return false;
    }

    const scanText = scanTextForEntry(entry, lorebook, context.messages);

    if (!matchesAnyKey(scanText, entry.keys, entry, lorebook)) {
        return false;
    }

    if (entry.secondaryKeys.length === 0) {
        return true;
    }

    return secondaryKeysAllowEntry(scanText, entry, lorebook);
}

function scanTextForEntry(entry: LorebookEntry, lorebook: Lorebook, messages: Message[]) {
    const scanDepth = Math.max(1, entry.scanDepth ?? lorebook.settings.scanDepth);
    const promptMessages = getPromptEligibleMessages(messages).slice(-scanDepth);

    return promptMessages
        .map((message) =>
            lorebook.settings.includeNames
                ? `${message.author}: ${getMessageContent(message)}`
                : getMessageContent(message),
        )
        .join("\n");
}

function secondaryKeysAllowEntry(
    scanText: string,
    entry: LorebookEntry,
    lorebook: Lorebook,
) {
    const matches = entry.secondaryKeys.map((key) =>
        matchesKey(scanText, key, entry, lorebook),
    );

    switch (entry.selectiveLogic) {
        case "and-all":
            return matches.every(Boolean);
        case "not-any":
            return !matches.some(Boolean);
        case "not-all":
            return !matches.every(Boolean);
        default:
            return matches.some(Boolean);
    }
}

function matchesAnyKey(
    scanText: string,
    keys: string[],
    entry: LorebookEntry,
    lorebook: Lorebook,
) {
    return keys.some((key) => matchesKey(scanText, key, entry, lorebook));
}

function matchesKey(
    scanText: string,
    key: string,
    entry: LorebookEntry,
    lorebook: Lorebook,
) {
    const safeKey = key.trim();

    if (!safeKey) {
        return false;
    }

    const caseSensitive = entry.caseSensitive ?? lorebook.settings.caseSensitive;
    const matchWholeWords = entry.matchWholeWords ?? lorebook.settings.matchWholeWords;
    const sourceText = caseSensitive ? scanText : scanText.toLowerCase();
    const targetKey = caseSensitive ? safeKey : safeKey.toLowerCase();

    if (!matchWholeWords) {
        return sourceText.includes(targetKey);
    }

    return new RegExp(
        `(^|[^\\p{L}\\p{N}_])${escapeRegExp(targetKey)}(?=$|[^\\p{L}\\p{N}_])`,
        "u",
    ).test(sourceText);
}

function triggerAllowsEntry(entry: LorebookEntry, generation: PromptGenerationContext) {
    if (entry.triggers.length === 0) {
        return true;
    }

    return entry.triggers.includes(lorebookTriggerForGeneration(generation.trigger));
}

function lorebookTriggerForGeneration(trigger: PromptGenerationContext["trigger"]) {
    switch (trigger) {
        case "swipe":
            return "swipe";
        case "regenerate":
            return "regenerate";
        case "continue":
            return "continue";
        case "quiet":
            return "quiet";
        default:
            return "normal";
    }
}

function probabilityAllowsEntry(entry: LorebookEntry) {
    return !entry.useProbability || Math.random() * 100 <= entry.probability;
}

function anchorForEntry(entry: LorebookEntry): PromptAnchor {
    switch (entry.position) {
        case "before-char":
            return "before-character";
        case "before-examples":
            return "before-examples";
        case "after-examples":
            return "after-examples";
        case "author-note-top":
        case "author-note-bottom":
            return "after-scenario";
        case "at-depth":
            return "at-depth";
        case "outlet":
            return "outlet";
        default:
            return "after-character";
    }
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
