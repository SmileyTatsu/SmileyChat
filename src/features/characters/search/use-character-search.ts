import { useCallback, useMemo, useState } from "preact/hooks";

import {
    searchCharacters,
    type CharacterSearchOptions,
    type CharacterSearchResult,
    type SearchableCharacter,
} from "#frontend/lib/characters/character-search";

export type UseCharacterSearchOptions<T extends SearchableCharacter> = {
    characters: T[];
    initialQuery?: string;
    filter?: CharacterSearchOptions["filter"];
    maxResults?: number;
};

export function useCharacterSearch<T extends SearchableCharacter>({
    characters,
    initialQuery = "",
    filter = "all",
    maxResults,
}: UseCharacterSearchOptions<T>) {
    const [query, setQuery] = useState(initialQuery);
    const [activeFilter, setActiveFilter] = useState<"all" | "favorites">(
        filter ?? "all",
    );

    const results: CharacterSearchResult<T>[] = useMemo(() => {
        return searchCharacters(characters, query, {
            filter: activeFilter,
            maxResults,
        });
    }, [characters, query, activeFilter, maxResults]);

    // A changed result set must never retain an index from the previous query/list.
    const [selection, setSelection] = useState({ results, index: 0 });
    const activeIndex = selection.results === results ? selection.index : 0;
    const setActiveIndex = (index: number) => setSelection({ results, index });

    const handleKeyDown = useCallback(
        (
            event: KeyboardEvent,
            options?: {
                onSelect?: (item: T) => void;
                onDismiss?: () => void;
            },
        ) => {
            if (
                event.isComposing ||
                event.defaultPrevented ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey
            )
                return;
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(results.length ? (activeIndex + 1) % results.length : 0);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(
                    results.length
                        ? (activeIndex - 1 + results.length) % results.length
                        : 0,
                );
            } else if (event.key === "Enter") {
                event.preventDefault();
                if (results[activeIndex]) {
                    options?.onSelect?.(results[activeIndex].item);
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                options?.onDismiss?.();
            }
        },
        [results, activeIndex],
    );

    return {
        query,
        setQuery,
        activeFilter,
        setActiveFilter,
        activeIndex,
        setActiveIndex,
        results,
        handleKeyDown,
        clearQuery: () => setQuery(""),
    };
}
