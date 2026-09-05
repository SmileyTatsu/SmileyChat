export type MatchRange = [number, number];

export interface SearchableCharacter {
    id: string;
    name: string;
    tagline?: string;
    tags?: string[];
    isFavorite?: boolean;
    updatedAt?: string;
    avatar?: { path?: string; type?: string };
}

export interface CharacterSearchResult<
    T extends SearchableCharacter = SearchableCharacter,
> {
    item: T;
    score: number;
    nameMatches: MatchRange[];
    taglineMatches: MatchRange[];
    matchedTag?: string;
}

export interface CharacterSearchOptions {
    filter?: "all" | "favorites";
    maxResults?: number;
}

export interface HighlightSegment {
    text: string;
    isMatch: boolean;
}

/**
 * Normalizes text for search: strips accents/diacritics, lowercases, and trims.
 */
export function normalizeSearchText(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

/** Keep normalized UTF-16 offsets aligned with the original display text. */
function searchTextWithOffsets(text: string) {
    return {
        normalized: normalizeSearchText(text),
        originalRanges: (ranges: MatchRange[]) => originalSearchRanges(text, ranges),
    };
}

function originalSearchRanges(text: string, ranges: MatchRange[]): MatchRange[] {
    // Only allocate offset maps for fields that actually need highlighting.
    if (!ranges.length) return [];
    const offsets: MatchRange[] = [];
    let normalized = "";
    let offset = 0;
    for (const character of text) {
        const value = character
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase();
        if (!value && offsets.length) {
            offsets[offsets.length - 1][1] = offset + character.length;
        }
        for (let i = 0; i < value.length; i++) {
            offsets.push([offset, offset + character.length]);
        }
        normalized += value;
        offset += character.length;
    }
    const leadingSpace = normalized.length - normalized.trimStart().length;
    return ranges.map(([start, end]) => [
        offsets[start + leadingSpace][0],
        offsets[end - 1 + leadingSpace][1],
    ]);
}

/**
 * Splits original text into segments indicating whether each part matched the search query.
 */
export function highlightText(text: string, ranges: MatchRange[]): HighlightSegment[] {
    if (!ranges.length || !text) {
        return [{ text, isMatch: false }];
    }

    // Merge and sort ranges
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: MatchRange[] = [];
    for (const [start, end] of sorted) {
        if (start >= end) continue;
        const last = merged[merged.length - 1];
        if (last && start <= last[1]) {
            last[1] = Math.max(last[1], end);
        } else {
            merged.push([start, end]);
        }
    }

    const segments: HighlightSegment[] = [];
    let currentIndex = 0;

    for (const [start, end] of merged) {
        const clampedStart = Math.max(0, Math.min(start, text.length));
        const clampedEnd = Math.max(0, Math.min(end, text.length));

        if (clampedStart > currentIndex) {
            segments.push({
                text: text.slice(currentIndex, clampedStart),
                isMatch: false,
            });
        }

        if (clampedEnd > clampedStart) {
            segments.push({
                text: text.slice(clampedStart, clampedEnd),
                isMatch: true,
            });
        }

        currentIndex = Math.max(currentIndex, clampedEnd);
    }

    if (currentIndex < text.length) {
        segments.push({
            text: text.slice(currentIndex),
            isMatch: false,
        });
    }

    return segments.filter((segment) => segment.text.length > 0);
}

/**
 * Finds fuzzy subsequence match indices of query inside target.
 * Returns array of matching indices in target, or null if not matched.
 */
function findFuzzyMatch(
    normalizedTarget: string,
    normalizedQuery: string,
): number[] | null {
    const indices: number[] = [];
    let targetIndex = 0;

    for (let queryIndex = 0; queryIndex < normalizedQuery.length; queryIndex++) {
        const queryChar = normalizedQuery[queryIndex];
        const found = normalizedTarget.indexOf(queryChar, targetIndex);

        if (found === -1) {
            return null;
        }

        indices.push(found);
        targetIndex = found + 1;
    }

    return indices;
}

/**
 * Converts single indices into contiguous [start, end] ranges.
 */
function indicesToRanges(indices: number[]): MatchRange[] {
    if (!indices.length) return [];
    const ranges: MatchRange[] = [];
    let start = indices[0];
    let prev = indices[0];

    for (let i = 1; i < indices.length; i++) {
        const curr = indices[i];
        if (curr === prev + 1) {
            prev = curr;
        } else {
            ranges.push([start, prev + 1]);
            start = curr;
            prev = curr;
        }
    }
    ranges.push([start, prev + 1]);
    return ranges;
}

/**
 * Generates acronym from words in text.
 */
function getAcronymData(normalizedText: string): {
    acronym: string;
    wordIndices: number[];
} {
    const words = normalizedText.split(/[\s_-]+/);
    let acronym = "";
    const wordIndices: number[] = [];
    let searchFrom = 0;

    for (const word of words) {
        if (!word) continue;
        const index = normalizedText.indexOf(word, searchFrom);
        if (index !== -1) {
            acronym += word[0];
            wordIndices.push(index);
            searchFrom = index + word.length;
        }
    }

    return { acronym, wordIndices };
}

/**
 * Searches and ranks a list of characters cleanly and efficiently.
 */
export function searchCharacters<T extends SearchableCharacter>(
    characters: T[],
    query: string,
    options: CharacterSearchOptions = {},
): CharacterSearchResult<T>[] {
    const { filter = "all", maxResults } = options;
    const normalizedQuery = normalizeSearchText(query);

    // Filter by options if needed
    const candidateList =
        filter === "favorites"
            ? characters.filter((character) => Boolean(character.isFavorite))
            : characters;

    // Fast path: Empty query returns sorted candidate list
    if (!normalizedQuery) {
        const results: CharacterSearchResult<T>[] = candidateList.map((item) => {
            let score = 100;
            if (item.isFavorite) score += 50;
            if (item.updatedAt) {
                const timestamp = new Date(item.updatedAt).getTime();
                if (!Number.isNaN(timestamp)) {
                    score += Math.min(20, Math.max(0, timestamp / 1e12));
                }
            }
            return {
                item,
                score,
                nameMatches: [],
                taglineMatches: [],
            };
        });

        results.sort((a, b) => b.score - a.score);
        return maxResults === undefined
            ? results
            : results.slice(0, Math.max(0, maxResults));
    }

    const results: CharacterSearchResult<T>[] = [];

    for (const item of candidateList) {
        const name = item.name ?? "";
        const nameText = searchTextWithOffsets(name);
        const normalizedName = nameText.normalized;
        const tagline = item.tagline ?? "";
        const taglineText = searchTextWithOffsets(tagline);
        const normalizedTagline = taglineText.normalized;

        let score = 0;
        let nameMatches: MatchRange[] = [];
        let taglineMatches: MatchRange[] = [];

        // 1. Exact name match
        if (normalizedName === normalizedQuery) {
            score = 1000;
            nameMatches = [[0, normalizedName.length]];
        }
        // 2. Prefix name match
        else if (normalizedName.startsWith(normalizedQuery)) {
            const coverageRatio =
                normalizedQuery.length / Math.max(1, normalizedName.length);
            score = 800 + Math.round(coverageRatio * 100);
            nameMatches = [[0, normalizedQuery.length]];
        }
        // 3. Word-boundary name match
        else {
            const wordRegex = new RegExp(
                `(?:^|[\\s_-])${escapeRegex(normalizedQuery)}`,
                "i",
            );
            const wordMatch = wordRegex.exec(normalizedName);
            if (wordMatch) {
                const matchOffset =
                    wordMatch.index + (wordMatch[0].length - normalizedQuery.length);
                score = 650 - Math.min(50, matchOffset * 2);
                nameMatches = [[matchOffset, matchOffset + normalizedQuery.length]];
            }
        }

        // 4. Acronym match (e.g. "SM" for "Sailor Moon")
        if (score === 0 && normalizedQuery.length >= 2) {
            const { acronym, wordIndices } = getAcronymData(normalizedName);
            const acronymIndex = acronym.indexOf(normalizedQuery);
            if (acronymIndex !== -1) {
                score = 500;
                nameMatches = [];
                for (let i = 0; i < normalizedQuery.length; i++) {
                    const wordIdx = wordIndices[acronymIndex + i];
                    if (wordIdx !== undefined) {
                        nameMatches.push([wordIdx, wordIdx + 1]);
                    }
                }
            }
        }

        // 5. Substring match in name
        if (score === 0) {
            const subIndex = normalizedName.indexOf(normalizedQuery);
            if (subIndex !== -1) {
                score = 400 - Math.min(100, subIndex * 5);
                nameMatches = [[subIndex, subIndex + normalizedQuery.length]];
            }
        }

        // 6. Fuzzy subsequence match in name
        if (score === 0) {
            const fuzzyIndices = findFuzzyMatch(normalizedName, normalizedQuery);
            if (fuzzyIndices) {
                const totalSpan =
                    fuzzyIndices[fuzzyIndices.length - 1] - fuzzyIndices[0] + 1;
                const penalty =
                    (totalSpan - normalizedQuery.length) * 8 + fuzzyIndices[0] * 3;
                score = Math.max(180, 280 - penalty);
                nameMatches = indicesToRanges(fuzzyIndices);
            }
        }

        // 7. Check tagline matches
        if (normalizedTagline) {
            const tagSubIndex = normalizedTagline.indexOf(normalizedQuery);
            if (tagSubIndex !== -1) {
                const tagScore = 150 - Math.min(50, tagSubIndex * 2);
                taglineMatches = [[tagSubIndex, tagSubIndex + normalizedQuery.length]];
                if (score > 0) {
                    score += 50; // Boost if matched both name and tagline
                } else {
                    score = tagScore;
                }
            }
        }

        // 8. Check tags array if present
        let matchedTag: string | undefined;
        let bestTagScore = 0;
        if (Array.isArray(item.tags) && item.tags.length > 0) {
            for (const tag of item.tags) {
                const normalizedTag = normalizeSearchText(tag);
                const tagScore =
                    normalizedTag === normalizedQuery
                        ? 700
                        : normalizedTag.startsWith(normalizedQuery)
                          ? 550
                          : normalizedTag.includes(normalizedQuery)
                            ? 350
                            : 0;
                if (tagScore > bestTagScore) {
                    bestTagScore = tagScore;
                    matchedTag = tag;
                }
            }
            score = Math.max(score, bestTagScore);
        }

        // Apply bonuses if we have a valid match
        if (score > 0) {
            if (item.isFavorite) {
                score += 30;
            }
            if (item.updatedAt) {
                const timestamp = new Date(item.updatedAt).getTime();
                if (!Number.isNaN(timestamp)) {
                    score += Math.min(10, Math.max(0, timestamp / 1e13));
                }
            }

            results.push({
                item,
                score,
                nameMatches: nameText.originalRanges(nameMatches),
                taglineMatches: taglineText.originalRanges(taglineMatches),
                ...(matchedTag ? { matchedTag } : {}),
            });
        }
    }

    // Sort highest score first; ties broken by name ascending
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.name.localeCompare(b.item.name);
    });

    return maxResults === undefined ? results : results.slice(0, Math.max(0, maxResults));
}

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
