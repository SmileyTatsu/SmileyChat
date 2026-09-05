import { Search, X } from "lucide-preact";
import type { Ref } from "preact";

export type CharacterSearchInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
    resultCount?: number;
    autoFocus?: boolean;
    inputRef?: Ref<HTMLInputElement>;
    listId?: string;
    activeOptionId?: string;
    className?: string;
};

export function CharacterSearchInput({
    value,
    onChange,
    placeholder = "Search characters...",
    onKeyDown,
    resultCount,
    autoFocus,
    inputRef,
    listId,
    activeOptionId,
    className = "",
}: CharacterSearchInputProps) {
    return (
        <div className={`character-search-input-wrap ${className}`}>
            <Search className="character-search-icon" size={15} aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                className="character-search-input"
                value={value}
                placeholder={placeholder}
                aria-label={placeholder}
                role={listId ? "combobox" : undefined}
                aria-expanded={listId ? true : undefined}
                aria-controls={listId}
                aria-activedescendant={activeOptionId}
                aria-autocomplete={listId ? "list" : undefined}
                autoComplete="off"
                autoFocus={autoFocus}
                onInput={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).value)
                }
                onKeyDown={onKeyDown}
            />
            {typeof resultCount === "number" && value.trim().length > 0 && (
                <span className="character-search-count" aria-live="polite">
                    {resultCount}
                </span>
            )}
            {value.length > 0 && (
                <button
                    className="character-search-clear"
                    type="button"
                    title="Clear search"
                    aria-label="Clear search"
                    onClick={(event) => {
                        onChange("");
                        event.currentTarget.parentElement
                            ?.querySelector("input")
                            ?.focus();
                    }}
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
