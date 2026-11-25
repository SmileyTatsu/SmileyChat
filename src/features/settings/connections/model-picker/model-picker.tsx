import { ChevronDown, Search, Star, X } from "lucide-preact";
import type { ComponentChildren, JSX } from "preact";
import {
    useCallback,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "preact/hooks";

import { groupOfModelId, highlightRanges, rankModels } from "./search";
import type { ModelPickerItem, ModelPickerProps } from "./types";

import "./model-picker.css";

type PopoverLayout = {
    /** Exactly one of `top` (opens down) or `bottom` (opens up) is set. */
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
};

type PickerRow =
    | { kind: "section"; label: string; key: string }
    | { kind: "item"; item: ModelPickerItem; optionIndex: number }
    | { kind: "custom"; id: string; optionIndex: number }
    | { kind: "more"; text: string }
    | { kind: "note"; text: string }
    | { kind: "empty"; text: string };

// Joined with a plain array, not template strings: prettier's class-name
// normalisation strips the leading space of `${cond ? " on" : ""}` fragments.
function cx(...names: Array<string | false | null | undefined>): string {
    return names.filter(Boolean).join(" ");
}

const maxGroups = 14;
const maxPopoverHeight = 460;
const minPopoverHeight = 140;
const noIds: string[] = [];

function groupKeyOf(item: ModelPickerItem): string {
    return item.group || groupOfModelId(item.id);
}

function itemsFromIds(
    ids: string[],
    byId: ReadonlyMap<string, ModelPickerItem>,
): ModelPickerItem[] {
    const seen = new Set<string>();
    const result: ModelPickerItem[] = [];

    for (const id of ids) {
        const item = byId.get(id);

        if (!item || seen.has(id)) {
            continue;
        }

        seen.add(id);
        result.push(item);
    }

    return result;
}

/**
 * Visible rows for one render pass. Sections are capped at `limit` rows each so
 * Favorites and Recent cannot hide "All models"; search results are capped as a
 * whole because they are one ranked list.
 */
function buildRows({
    emptyHint,
    favorites,
    group,
    items,
    limit,
    query,
    recent,
}: {
    emptyHint?: string;
    favorites: string[];
    group: string;
    items: ModelPickerItem[];
    limit: number;
    query: string;
    recent: string[];
}): {
    rows: PickerRow[];
    optionIds: string[];
    shownCount: number;
    matchCount: number;
    loose: boolean;
} {
    const rows: PickerRow[] = [];
    const optionIds: string[] = [];
    const favoritesSet = new Set(favorites);
    const byId = new Map(items.map((item) => [item.id, item]));
    const typed = query.trim();
    const rowLimit = Math.max(1, Math.trunc(limit) || 1);
    const shownIds = new Set<string>();
    let matchCount = 0;
    let loose = false;

    function addItem(item: ModelPickerItem) {
        rows.push({ kind: "item", item, optionIndex: optionIds.length });
        optionIds.push(item.id);
        shownIds.add(item.id);
    }

    function addSection(label: string, sectionItems: ModelPickerItem[], index: number) {
        if (!sectionItems.length) {
            return;
        }

        rows.push({ kind: "section", label, key: `section-${index}-${label}` });

        for (const item of sectionItems.slice(0, rowLimit)) {
            addItem(item);
        }

        if (sectionItems.length > rowLimit) {
            rows.push({
                kind: "more",
                text: `…${sectionItems.length - rowLimit} more. Type to narrow down.`,
            });
        }
    }

    if (!typed) {
        const pool = group ? items.filter((item) => groupKeyOf(item) === group) : items;
        const favoriteItems = group ? [] : itemsFromIds(favorites, byId);
        const recentItems = group ? [] : itemsFromIds(recent, byId);
        if (items.length === 0) {
            rows.push({ kind: "empty", text: emptyHint ?? "No models available yet." });
        }

        if (favoriteItems.length) {
            addSection("Favorites", favoriteItems, 0);
        }

        if (recentItems.length) {
            addSection("Recent", recentItems, 1);
        }

        const rest = group ? pool : pool.filter((item) => !favoritesSet.has(item.id));
        const sectionLabel = group || "All models";
        addSection(sectionLabel, rest, 2);

        matchCount = shownIds.size;

        if (!rows.length) {
            rows.push({ kind: "empty", text: "No models in this group." });
        }
    } else {
        const pool = group ? items.filter((item) => groupKeyOf(item) === group) : items;
        const ranked = rankModels(pool, query, favoritesSet);
        matchCount = ranked.items.length;
        loose = ranked.loose;

        if (items.length === 0) {
            rows.push({ kind: "empty", text: emptyHint ?? "No models available yet." });
        }

        if (loose) {
            rows.push({ kind: "note", text: "No exact matches. Showing loose matches." });
        }

        for (const item of ranked.items.slice(0, rowLimit)) {
            addItem(item);
        }

        if (ranked.items.length > rowLimit) {
            rows.push({
                kind: "more",
                text: `…${ranked.items.length - rowLimit} more. Type to narrow down.`,
            });
        }
    }

    if (typed && !items.some((item) => item.id === typed)) {
        rows.push({ kind: "custom", id: typed, optionIndex: optionIds.length });
        optionIds.push(typed);
    }

    return { rows, optionIds, shownCount: shownIds.size, matchCount, loose };
}

function renderHighlighted(text: string, query: string): ComponentChildren {
    const ranges = highlightRanges(text, query);

    if (!ranges.length) {
        return text;
    }

    const parts: ComponentChildren[] = [];
    let cursor = 0;

    ranges.forEach(([start, end], index) => {
        if (start > cursor) {
            parts.push(text.slice(cursor, start));
        }

        parts.push(<mark key={index}>{text.slice(start, end)}</mark>);
        cursor = end;
    });

    if (cursor < text.length) {
        parts.push(text.slice(cursor));
    }

    return parts;
}

export function ModelPicker({
    disabled = false,
    emptyHint,
    favorites = noIds,
    items,
    limit,
    onSelect,
    onToggleFavorite,
    placeholder,
    recent = noIds,
    value,
}: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [group, setGroup] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [layout, setLayout] = useState<PopoverLayout>({
        top: 0,
        left: 0,
        width: 280,
        maxHeight: maxPopoverHeight,
    });

    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const groupsRef = useRef<HTMLDivElement>(null);

    const rawId = useId();
    const idPrefix = `model-picker-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const listId = `${idPrefix}-list`;

    const { rows, optionIds, shownCount, matchCount, loose } = useMemo(
        () =>
            buildRows({
                emptyHint,
                favorites,
                group,
                items,
                limit,
                query,
                recent,
            }),
        [emptyHint, favorites, group, items, limit, query, recent],
    );

    const groupChips = useMemo(() => {
        const counts = new Map<string, number>();

        for (const item of items) {
            const key = groupKeyOf(item);

            if (key) {
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }

        return [...counts.entries()]
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxGroups);
    }, [items]);

    const selectedItem = useMemo(
        () => items.find((item) => item.id === value) ?? null,
        [items, value],
    );

    const safeActiveIndex = Math.min(
        Math.max(0, activeIndex),
        Math.max(-1, optionIds.length - 1),
    );
    const activeOptionId = safeActiveIndex >= 0 ? optionIds[safeActiveIndex] : undefined;

    const close = useCallback((restoreFocus: boolean) => {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);

        if (restoreFocus) {
            triggerRef.current?.focus();
        }
    }, []);

    const choose = useCallback(
        (id: string) => {
            onSelect(id);
            close(true);
        },
        [close, onSelect],
    );

    const updateLayout = useCallback(() => {
        const trigger = triggerRef.current;

        if (!trigger) {
            return;
        }

        const rect = trigger.getBoundingClientRect();
        const margin = 8;
        const gap = 6;
        const width = Math.min(Math.max(rect.width, 260), window.innerWidth - margin * 2);
        const left = Math.min(
            Math.max(rect.left, margin),
            Math.max(margin, window.innerWidth - width - margin),
        );
        const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
        const spaceAbove = rect.top - gap - margin;
        // Never size from the popover's own content: filtering shrinks it and a
        // content-based cap would ratchet down and never grow back.
        const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;
        const available = openUp ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(
            minPopoverHeight,
            Math.min(maxPopoverHeight, available),
        );
        const top = openUp ? undefined : rect.bottom + gap;
        const bottom = openUp ? window.innerHeight - rect.top + gap : undefined;

        setLayout((previous) =>
            previous.top === top &&
            previous.bottom === bottom &&
            previous.left === left &&
            previous.width === width &&
            previous.maxHeight === maxHeight
                ? previous
                : { top, bottom, left, width, maxHeight },
        );
    }, []);

    // Everything below uses layout effects on purpose. Preact's useEffect runs
    // after a frame callback, and when that callback is delayed (hidden or
    // throttled tab) the popover stayed invisible until the next render, so the
    // first click appeared to do nothing. Layout effects run synchronously.
    useLayoutEffect(() => {
        if (open) {
            searchRef.current?.focus();
        }
    }, [open]);

    useLayoutEffect(() => {
        if (disabled && open) {
            close(false);
        }
    }, [close, disabled, open]);

    // Position once per open, then keep it attached to the trigger while any
    // ancestor scrolls instead of closing (the Options modal scrolls itself).
    useLayoutEffect(() => {
        if (!open) {
            return undefined;
        }

        updateLayout();

        let frame = 0;

        function schedule() {
            if (frame) {
                return;
            }

            frame = window.requestAnimationFrame(() => {
                frame = 0;
                updateLayout();
            });
        }

        window.addEventListener("resize", schedule);
        document.addEventListener("scroll", schedule, true);

        return () => {
            if (frame) {
                window.cancelAnimationFrame(frame);
            }

            window.removeEventListener("resize", schedule);
            document.removeEventListener("scroll", schedule, true);
        };
    }, [open, updateLayout]);

    useLayoutEffect(() => {
        if (open) {
            updateLayout();
        }
    }, [
        group,
        groupChips.length,
        items.length,
        limit,
        open,
        query,
        rows.length,
        updateLayout,
    ]);

    useLayoutEffect(() => {
        if (!open) {
            return undefined;
        }

        function handlePointerDown(event: PointerEvent) {
            const root = rootRef.current;

            if (!root || !(event.target instanceof Node)) {
                return;
            }

            if (!root.contains(event.target)) {
                close(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown, true);

        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [close, open]);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }

        const active = listRef.current?.querySelector<HTMLElement>(
            `[data-option-index="${safeActiveIndex}"]`,
        );
        active?.scrollIntoView({ block: "nearest" });
    }, [group, open, query, rows.length, safeActiveIndex]);

    // The chip row is a single horizontal strip; keep the active chip visible
    // without scrolling the Options modal or the popover itself.
    useLayoutEffect(() => {
        if (!open || !group) {
            return;
        }

        const container = groupsRef.current;
        const chip = container?.querySelector<HTMLElement>(".model-picker-chip.is-on");

        if (!container || !chip) {
            return;
        }

        const box = container.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();

        if (chipBox.left < box.left) {
            container.scrollLeft -= box.left - chipBox.left + 8;
        } else if (chipBox.right > box.right) {
            container.scrollLeft += chipBox.right - box.right + 8;
        }
    }, [group, open]);

    function moveActive(delta: number) {
        if (!optionIds.length) {
            return;
        }

        setActiveIndex((current) => {
            const clamped = Math.min(current, optionIds.length - 1);
            return Math.max(0, Math.min(optionIds.length - 1, clamped + delta));
        });
    }

    function handleSearchKeyDown(event: JSX.TargetedKeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActive(1);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(-1);
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();

            if (activeOptionId) {
                choose(activeOptionId);
                return;
            }

            const typed = query.trim();

            if (typed) {
                choose(typed);
            }

            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            // The Options modal closes on Escape; close only the picker.
            event.stopPropagation();
            close(true);
        }
    }

    function handleTriggerClick() {
        if (open) {
            close(false);
            return;
        }

        // Lay out against the trigger before the first paint so the popover
        // never flashes at the top-left corner of the viewport.
        updateLayout();
        setQuery("");
        setGroup("");
        setActiveIndex(0);
        setOpen(true);
    }

    function toggleGroup(key: string) {
        setGroup((current) => (current === key ? "" : key));
        setActiveIndex(0);
    }

    const showPlaceholder = !value;
    const triggerLabel = selectedItem
        ? selectedItem.label
        : value || placeholder || "Select a model";
    const triggerDetail =
        selectedItem && selectedItem.label !== selectedItem.id ? selectedItem.id : null;
    const footer = items.length
        ? `${query.trim() ? matchCount : shownCount} of ${items.length} models`
        : "";
    const highlightQuery = loose ? "" : query;

    function renderItemRow(item: ModelPickerItem, optionIndex: number) {
        const isFavorite = favorites.includes(item.id);
        const isActive = optionIndex === safeActiveIndex;
        const isCurrent = item.id === value;

        return (
            <div
                key={`item-${optionIndex}`}
                id={`${idPrefix}-option-${optionIndex}`}
                role="option"
                aria-selected={isActive}
                data-option-index={optionIndex}
                className={cx(
                    "model-picker-row",
                    isActive && "is-active",
                    isCurrent && "is-current",
                )}
                onClick={() => choose(item.id)}
                onMouseMove={() => {
                    if (!isActive) {
                        setActiveIndex(optionIndex);
                    }
                }}
            >
                <button
                    type="button"
                    className={cx("model-picker-star", isFavorite && "is-on")}
                    aria-label={
                        isFavorite
                            ? `Remove ${item.id} from favorites`
                            : `Add ${item.id} to favorites`
                    }
                    aria-pressed={isFavorite}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(item.id);
                    }}
                >
                    <Star
                        size={14}
                        aria-hidden="true"
                        fill={isFavorite ? "currentColor" : "none"}
                    />
                </button>
                <span className="model-picker-row-text">
                    <span className="model-picker-row-label">
                        {renderHighlighted(item.label, highlightQuery)}
                    </span>
                    {item.label !== item.id && (
                        <span className="model-picker-row-id">
                            {renderHighlighted(item.id, highlightQuery)}
                        </span>
                    )}
                </span>
                {item.meta && <span className="model-picker-row-meta">{item.meta}</span>}
            </div>
        );
    }

    return (
        <div className="model-picker" ref={rootRef}>
            <button
                type="button"
                ref={triggerRef}
                className={cx(
                    "model-picker-trigger",
                    showPlaceholder && "is-placeholder",
                )}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                onClick={handleTriggerClick}
            >
                <span className="model-picker-trigger-text">
                    <span
                        className={cx(
                            "model-picker-trigger-label",
                            !selectedItem && value && "is-mono",
                        )}
                    >
                        {triggerLabel}
                    </span>
                    {triggerDetail && (
                        <span className="model-picker-trigger-id">{triggerDetail}</span>
                    )}
                </span>
                <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className="model-picker-chevron"
                />
            </button>

            {open && (
                <div
                    ref={popoverRef}
                    className="model-picker-popover"
                    role="presentation"
                    style={{
                        top: layout.top === undefined ? "auto" : `${layout.top}px`,
                        bottom:
                            layout.bottom === undefined ? "auto" : `${layout.bottom}px`,
                        left: `${layout.left}px`,
                        width: `${layout.width}px`,
                        maxHeight: `${layout.maxHeight}px`,
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            close(true);
                        }
                    }}
                >
                    <div className="model-picker-search">
                        <Search size={14} aria-hidden="true" />
                        <input
                            ref={searchRef}
                            type="text"
                            role="combobox"
                            aria-expanded="true"
                            aria-controls={listId}
                            aria-autocomplete="list"
                            aria-activedescendant={
                                activeOptionId
                                    ? `${idPrefix}-option-${safeActiveIndex}`
                                    : undefined
                            }
                            aria-label="Search models"
                            autoComplete="off"
                            spellcheck={false}
                            placeholder="Search models. Words match in any order."
                            value={query}
                            onInput={(event) => {
                                setQuery((event.currentTarget as HTMLInputElement).value);
                                setActiveIndex(0);
                            }}
                            onKeyDown={handleSearchKeyDown}
                        />
                        {query && (
                            <button
                                type="button"
                                className="model-picker-clear"
                                aria-label="Clear search"
                                onClick={() => {
                                    setQuery("");
                                    setActiveIndex(0);
                                    searchRef.current?.focus();
                                }}
                            >
                                <X size={13} aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    {groupChips.length >= 2 && (
                        <div className="model-picker-groups" ref={groupsRef}>
                            {groupChips.map(([key, count]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={cx(
                                        "model-picker-chip",
                                        group === key && "is-on",
                                    )}
                                    aria-pressed={group === key}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => toggleGroup(key)}
                                >
                                    {key} {count}
                                </button>
                            ))}
                        </div>
                    )}

                    <div
                        ref={listRef}
                        id={listId}
                        className="model-picker-list"
                        role="listbox"
                        aria-label="Models"
                    >
                        {rows.map((row, index) => {
                            if (row.kind === "section") {
                                return (
                                    <div
                                        key={row.key}
                                        className="model-picker-section"
                                        role="presentation"
                                    >
                                        {row.label}
                                    </div>
                                );
                            }

                            if (row.kind === "item") {
                                return renderItemRow(row.item, row.optionIndex);
                            }

                            if (row.kind === "custom") {
                                const isActive = row.optionIndex === safeActiveIndex;

                                return (
                                    <div
                                        key="custom"
                                        id={`${idPrefix}-option-${row.optionIndex}`}
                                        role="option"
                                        aria-selected={isActive}
                                        data-option-index={row.optionIndex}
                                        className={cx(
                                            "model-picker-row model-picker-row-custom",
                                            isActive && "is-active",
                                        )}
                                        onClick={() => choose(row.id)}
                                        onMouseMove={() => {
                                            if (!isActive) {
                                                setActiveIndex(row.optionIndex);
                                            }
                                        }}
                                    >
                                        <span className="model-picker-row-text">
                                            <span className="model-picker-row-label">
                                                Use "{row.id}" as the model id
                                            </span>
                                        </span>
                                        <span className="model-picker-row-meta">
                                            custom
                                        </span>
                                    </div>
                                );
                            }

                            if (row.kind === "more") {
                                return (
                                    <div
                                        key={`more-${index}`}
                                        className="model-picker-hint"
                                        role="presentation"
                                    >
                                        {row.text}
                                    </div>
                                );
                            }

                            if (row.kind === "note") {
                                return (
                                    <div
                                        key={`note-${index}`}
                                        className="model-picker-hint"
                                        role="presentation"
                                    >
                                        {row.text}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={`empty-${index}`}
                                    className="model-picker-empty"
                                    role="presentation"
                                >
                                    {row.text}
                                </div>
                            );
                        })}
                    </div>

                    {footer && <div className="model-picker-footer">{footer}</div>}
                </div>
            )}
        </div>
    );
}
