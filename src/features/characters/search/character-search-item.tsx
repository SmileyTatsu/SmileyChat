import { MessageSquare, Star, Tag } from "lucide-preact";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import type {
    CharacterSearchResult,
    SearchableCharacter,
} from "#frontend/lib/characters/character-search";

import { CharacterHighlight } from "./character-highlight";

export type CharacterSearchItemProps<T extends SearchableCharacter> = {
    result: CharacterSearchResult<T>;
    isActive: boolean;
    id?: string;
    chatCount?: number;
    status?: "online" | "away" | "dnd" | "offline";
    onSelect: (character: T) => void;
};

export function CharacterSearchItem<T extends SearchableCharacter>({
    result,
    isActive,
    id,
    chatCount,
    status,
    onSelect,
}: CharacterSearchItemProps<T>) {
    const { item, nameMatches, taglineMatches } = result;
    const avatarUrl = item.avatar?.path || characterInitialAvatar(item.name);

    return (
        <button
            type="button"
            id={id}
            className={`character-search-item ${isActive ? "active" : ""}`}
            onClick={() => onSelect(item)}
            role="option"
            aria-selected={isActive}
            title={item.name}
        >
            <div className="character-search-avatar-wrap">
                <img
                    className="character-search-avatar"
                    src={avatarUrl}
                    alt=""
                    draggable={false}
                    width={36}
                    height={36}
                    loading="lazy"
                />
                {status && (
                    <i
                        className={`status-dot ${status} character-search-status-dot`}
                        aria-label={status}
                    />
                )}
            </div>

            <div className="character-search-content">
                <div className="character-search-name-row">
                    <strong className="character-search-name">
                        <CharacterHighlight text={item.name} ranges={nameMatches} />
                    </strong>
                    {item.isFavorite && (
                        <span className="character-search-star" title="Favorite">
                            <Star size={12} fill="currentColor" />
                        </span>
                    )}
                    {result.matchedTag && (
                        <span
                            className="character-search-tag-badge"
                            title={`Matched tag: ${result.matchedTag}`}
                        >
                            <Tag size={10} />
                            <span>{result.matchedTag}</span>
                        </span>
                    )}
                </div>

                {item.tagline && (
                    <p className="character-search-tagline">
                        <CharacterHighlight text={item.tagline} ranges={taglineMatches} />
                    </p>
                )}
            </div>

            {typeof chatCount === "number" && chatCount > 0 && (
                <div className="character-search-chat-count" title={`${chatCount} chats`}>
                    <MessageSquare size={12} />
                    <span>{chatCount}</span>
                </div>
            )}
        </button>
    );
}
