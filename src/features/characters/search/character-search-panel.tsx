import { Sparkles, Star, Users, X } from "lucide-preact";
import { useEffect, useId, useRef } from "preact/hooks";

import type { SearchableCharacter } from "#frontend/lib/characters/character-search";

import { CharacterSearchInput } from "./character-search-input";
import { CharacterSearchItem } from "./character-search-item";
import { useCharacterSearch } from "./use-character-search";

export type CharacterSearchPanelProps<T extends SearchableCharacter> = {
    characters: T[];
    chatCountsByCharacterId?: Record<string, number>;
    onSelectCharacter: (characterId: string) => void;
    onClose: () => void;
    onCreateCharacter?: () => void;
};

export function CharacterSearchPanel<T extends SearchableCharacter>({
    characters,
    chatCountsByCharacterId = {},
    onSelectCharacter,
    onClose,
    onCreateCharacter,
}: CharacterSearchPanelProps<T>) {
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const {
        query,
        setQuery,
        activeFilter,
        setActiveFilter,
        activeIndex,
        results,
        handleKeyDown,
    } = useCharacterSearch({
        characters,
    });

    useEffect(() => {
        const previousFocus = document.activeElement;
        inputRef.current?.focus();
        return () => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
                previousFocus.focus();
            }
        };
    }, []);

    // Scroll active item into view when navigating via keyboard
    useEffect(() => {
        if (!listRef.current) return;
        const activeEl = listRef.current.querySelector(
            ".character-search-item.active",
        ) as HTMLElement | null;
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex, results]);

    const handleSelect = (item: T) => {
        onSelectCharacter(item.id);
        onClose();
    };

    const hasFavorites = characters.some((c) => c.isFavorite);

    return (
        <div
            className="character-search-panel"
            role="dialog"
            aria-label="Find character"
            onKeyDown={(event) => {
                if (
                    event.key === "Escape" &&
                    !event.isComposing &&
                    !event.defaultPrevented
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <div className="character-search-header">
                <div className="character-search-header-title">
                    <Sparkles size={16} aria-hidden="true" />
                    <strong>Find Character</strong>
                    <span className="character-search-total-badge">
                        {characters.length}
                    </span>
                </div>
                <button
                    className="rail-icon-button"
                    type="button"
                    title="Close character search (Esc)"
                    aria-label="Close character search"
                    onClick={onClose}
                >
                    <X size={15} />
                </button>
            </div>

            <div className="character-search-input-section">
                <CharacterSearchInput
                    inputRef={inputRef}
                    listId={listId}
                    activeOptionId={
                        results[activeIndex]
                            ? `${listId}-${results[activeIndex].item.id}`
                            : undefined
                    }
                    value={query}
                    onChange={setQuery}
                    placeholder="Search name, tagline, tags..."
                    resultCount={results.length}
                    onKeyDown={(event) =>
                        handleKeyDown(event, {
                            onSelect: handleSelect,
                            onDismiss: onClose,
                        })
                    }
                />
            </div>

            {(hasFavorites || activeFilter === "favorites") && (
                <div
                    className="character-search-filter-pills"
                    role="group"
                    aria-label="Filter characters"
                >
                    <button
                        type="button"
                        aria-pressed={activeFilter === "all"}
                        className={`character-search-pill ${
                            activeFilter === "all" ? "active" : ""
                        }`}
                        onClick={() => setActiveFilter("all")}
                    >
                        <Users size={12} />
                        All ({characters.length})
                    </button>
                    <button
                        type="button"
                        aria-pressed={activeFilter === "favorites"}
                        className={`character-search-pill ${
                            activeFilter === "favorites" ? "active" : ""
                        }`}
                        onClick={() => setActiveFilter("favorites")}
                    >
                        <Star size={12} fill="currentColor" />
                        Favorites ({characters.filter((c) => c.isFavorite).length})
                    </button>
                </div>
            )}

            <div
                className="character-search-list"
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label="Matching characters"
            >
                {results.length > 0 ? (
                    results.map((result, index) => (
                        <CharacterSearchItem
                            key={result.item.id}
                            id={`${listId}-${result.item.id}`}
                            result={result}
                            isActive={index === activeIndex}
                            chatCount={chatCountsByCharacterId[result.item.id]}
                            onSelect={handleSelect}
                        />
                    ))
                ) : (
                    <div className="character-search-empty">
                        <p>No characters found for "{query}"</p>
                        {onCreateCharacter && (
                            <button
                                type="button"
                                className="character-search-empty-create"
                                onClick={() => {
                                    onCreateCharacter();
                                    onClose();
                                }}
                            >
                                Create new character
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="character-search-footer" aria-hidden="true">
                <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> navigate
                </span>
                <span>
                    <kbd>↵</kbd> select
                </span>
                <span>
                    <kbd>esc</kbd> close
                </span>
            </div>
        </div>
    );
}
