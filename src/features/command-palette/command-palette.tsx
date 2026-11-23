import {
    MessageSquare,
    PanelRight,
    Plus,
    Search,
    Settings,
    User,
} from "lucide-preact";
import { Fragment } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { CharacterSummary } from "#frontend/lib/characters/types";
import { chatDisplayTitle } from "#frontend/lib/chats/normalize";
import type { ChatSummary } from "#frontend/lib/chats/types";

import "./command-palette.css";

type PaletteItem = {
    id: string;
    group: "Actions" | "Characters" | "Chats";
    label: string;
    hint?: string;
    icon: "chat" | "character" | "action" | "panel" | "settings";
    run: () => void;
};

type CommandPaletteProps = {
    characters: CharacterSummary[];
    chats: ChatSummary[];
    characterNamesById: Record<string, string>;
    isOpen: boolean;
    onClose: () => void;
    onNewChat: () => void;
    onOpenOptions: () => void;
    onSelectCharacter: (characterId: string) => void;
    onSelectChat: (chatId: string) => void;
    onToggleCharacterPanel: () => void;
};

const maxResultsPerGroup = 6;

export function CommandPalette({
    characters,
    chats,
    characterNamesById,
    isOpen,
    onClose,
    onNewChat,
    onOpenOptions,
    onSelectCharacter,
    onSelectChat,
    onToggleCharacterPanel,
}: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const items = useMemo<PaletteItem[]>(() => {
        const chatItems = chats.map<PaletteItem>((chat) => {
            const characterName = characterNamesById[chat.characterId] ?? "";
            const title = chatDisplayTitle(chat);

            return {
                id: `chat:${chat.id}`,
                group: "Chats",
                label: title,
                hint: [characterName, `${chat.messageCount} messages`]
                    .filter(Boolean)
                    .join(" · "),
                icon: "chat",
                run: () => onSelectChat(chat.id),
            };
        });

        const characterItems = characters.map<PaletteItem>((character) => ({
            id: `character:${character.id}`,
            group: "Characters",
            label: character.name,
            hint: character.tagline,
            icon: "character",
            run: () => onSelectCharacter(character.id),
        }));

        const actionItems: PaletteItem[] = [
            {
                id: "action:new-chat",
                group: "Actions",
                label: "New chat",
                icon: "action",
                run: onNewChat,
            },
            {
                id: "action:options",
                group: "Actions",
                label: "Open options",
                hint: "Connections, presets, personas…",
                icon: "settings",
                run: onOpenOptions,
            },
            {
                id: "action:toggle-character-panel",
                group: "Actions",
                label: "Toggle character panel",
                icon: "panel",
                run: onToggleCharacterPanel,
            },
        ];

        return [...actionItems, ...characterItems, ...chatItems];
    }, [
        characterNamesById,
        characters,
        chats,
        onNewChat,
        onOpenOptions,
        onSelectCharacter,
        onSelectChat,
        onToggleCharacterPanel,
    ]);

    const results = useMemo(() => filterItems(items, query), [items, query]);

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setActiveIndex(0);
        }
    }, [isOpen]);

    // Preact does not apply autoFocus on mount, so focus the field explicitly
    // and keep Escape working even if focus drifts to the page behind it.
    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        inputRef.current?.focus();

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const item = listRef.current?.querySelector<HTMLElement>(
            `[data-index="${activeIndex}"]`,
        );
        item?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, isOpen]);

    if (!isOpen) {
        return null;
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % Math.max(1, results.length));
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(
                (index) => (index - 1 + Math.max(1, results.length)) % Math.max(1, results.length),
            );
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            const item = results[activeIndex];
            if (item) {
                onClose();
                item.run();
            }
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    }

    let lastGroup = "";

    return (
        <div className="command-palette-backdrop" onClick={onClose} role="presentation">
            <div
                className="command-palette"
                role="dialog"
                aria-label="Command palette"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="command-palette-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        placeholder="Search chats, characters or commands"
                        aria-label="Search chats and characters"
                        onInput={(event) =>
                            setQuery((event.currentTarget as HTMLInputElement).value)
                        }
                        onKeyDown={handleKeyDown}
                    />
                    <kbd>Esc</kbd>
                </div>

                <div className="command-palette-list" ref={listRef} role="listbox">
                    {results.length === 0 && (
                        <p className="command-palette-empty">No matches for “{query}”.</p>
                    )}

                    {results.map((item, index) => {
                        const showGroup = item.group !== lastGroup;
                        lastGroup = item.group;

                        return (
                            <Fragment key={item.id}>
                                {showGroup && (
                                    <p className="command-palette-group">{item.group}</p>
                                )}
                                <button
                                    type="button"
                                    data-index={index}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    className="command-palette-item"
                                    data-active={index === activeIndex}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => {
                                        onClose();
                                        item.run();
                                    }}
                                >
                                    <span className="command-palette-icon" aria-hidden="true">
                                        <PaletteIcon icon={item.icon} />
                                    </span>
                                    <span className="command-palette-text">
                                        <strong>{item.label}</strong>
                                        {item.hint && <small>{item.hint}</small>}
                                    </span>
                                </button>
                            </Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function PaletteIcon({ icon }: { icon: PaletteItem["icon"] }) {
    if (icon === "character") return <User size={15} />;
    if (icon === "action") return <Plus size={15} />;
    if (icon === "settings") return <Settings size={15} />;
    if (icon === "panel") return <PanelRight size={15} />;
    return <MessageSquare size={15} />;
}

function filterItems(items: PaletteItem[], query: string) {
    const needle = query.trim().toLowerCase();

    if (!needle) {
        return [
            ...items.filter((item) => item.group === "Actions"),
            ...items.filter((item) => item.group === "Characters").slice(0, maxResultsPerGroup),
            ...items.filter((item) => item.group === "Chats").slice(0, maxResultsPerGroup),
        ];
    }

    const scored = items
        .map((item) => ({ item, score: scoreItem(item, needle) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

    const counts: Record<string, number> = {};

    return scored
        .filter(({ item }) => {
            counts[item.group] = (counts[item.group] ?? 0) + 1;
            return counts[item.group] <= maxResultsPerGroup;
        })
        .map(({ item }) => item);
}

function scoreItem(item: PaletteItem, needle: string) {
    const label = item.label.toLowerCase();
    const hint = (item.hint ?? "").toLowerCase();

    if (label === needle) return 100;
    if (label.startsWith(needle)) return 80;

    const wordStart = label.split(/[\s\-–—:·]+/).some((word) => word.startsWith(needle));
    if (wordStart) return 60;
    if (label.includes(needle)) return 40;
    if (hint.includes(needle)) return 20;

    return 0;
}
