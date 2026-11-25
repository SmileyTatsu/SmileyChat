import type { ModelPickerItem } from "./types";

/**
 * Chip key for a model id when the caller has no explicit group: the provider
 * prefix before `/`, otherwise the first token up to one of `- : . _`.
 */
export function groupOfModelId(id: string): string {
    return (id.includes("/") ? id.split("/")[0] : id.split(/[-:._]/)[0]).toLowerCase();
}

/** Lower-cased search words. The picker matches words in any order. */
export function tokenizeQuery(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
}

const boundaryPattern = /[/\-_:. ]/;

/**
 * Score one field for all query words. -1 means at least one word is missing.
 * Lower is better: a word at the start of the field costs nothing, a word after
 * a separator costs 1 and a word inside another word costs 3. Field length is
 * the tie-breaker so the shortest matching id wins.
 */
function scoreField(text: string, tokens: string[]): number {
    const haystack = text.toLowerCase();
    let total = 0;

    for (const token of tokens) {
        const index = haystack.indexOf(token);

        if (index < 0) {
            return -1;
        }

        total += index === 0 ? 0 : boundaryPattern.test(haystack[index - 1]) ? 1 : 3;
    }

    return total * 1000 + haystack.length;
}

function scoreItem(item: ModelPickerItem, tokens: string[]): number {
    const idScore = scoreField(item.id, tokens);
    const labelScore =
        item.label && item.label !== item.id ? scoreField(item.label, tokens) : -1;

    if (idScore < 0) {
        return labelScore;
    }

    if (labelScore < 0) {
        return idScore;
    }

    return Math.min(idScore, labelScore);
}

function isSubsequence(haystack: string, needle: string): boolean {
    let position = 0;

    for (const character of haystack) {
        if (character === needle[position]) {
            position += 1;
        }
    }

    return position === needle.length;
}

function looseMatch(item: ModelPickerItem, needle: string): boolean {
    if (!needle) {
        return false;
    }

    if (isSubsequence(item.id.toLowerCase(), needle)) {
        return true;
    }

    return item.label !== item.id && isSubsequence(item.label.toLowerCase(), needle);
}

export type RankedModels = {
    items: ModelPickerItem[];
    /** True when no word matches and these are loose subsequence matches. */
    loose: boolean;
};

/**
 * All models matching `query`, favorites first. Never truncated: callers cap
 * how many rows they render. With no query every item is returned.
 */
export function rankModels(
    items: ModelPickerItem[],
    query: string,
    favorites: ReadonlySet<string>,
): RankedModels {
    const tokens = tokenizeQuery(query);

    if (!tokens.length) {
        return { items: [...items], loose: false };
    }

    const scored = items
        .map((item, index) => ({ item, index, score: scoreItem(item, tokens) }))
        .filter((entry) => entry.score >= 0)
        .sort(
            (a, b) =>
                Number(favorites.has(b.item.id)) - Number(favorites.has(a.item.id)) ||
                a.score - b.score ||
                a.index - b.index,
        )
        .map((entry) => entry.item);

    if (scored.length) {
        return { items: scored, loose: false };
    }

    const needle = tokens.join("");
    const looseItems = items.filter((item) => looseMatch(item, needle));

    return { items: looseItems, loose: looseItems.length > 0 };
}

/**
 * Ranges to wrap in `<mark>` for a query: one per word (first occurrence), with
 * overlapping ranges merged. End is exclusive.
 */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
    const tokens = tokenizeQuery(query);

    if (!tokens.length || !text) {
        return [];
    }

    const haystack = text.toLowerCase();
    const marks: Array<[number, number]> = [];

    for (const token of tokens) {
        const index = haystack.indexOf(token);

        if (index >= 0) {
            marks.push([index, index + token.length]);
        }
    }

    if (!marks.length) {
        return [];
    }

    marks.sort((a, b) => a[0] - b[0]);

    const merged: Array<[number, number]> = [marks[0].slice() as [number, number]];

    for (const mark of marks.slice(1)) {
        const last = merged[merged.length - 1];

        if (mark[0] <= last[1]) {
            last[1] = Math.max(last[1], mark[1]);
        } else {
            merged.push(mark.slice() as [number, number]);
        }
    }

    return merged;
}
