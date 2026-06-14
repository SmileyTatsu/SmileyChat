import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import { chatDisplayTitle } from "#frontend/lib/chats/normalize";
import type { CharacterSummary, ChatSummary } from "#frontend/types";

import { GroupAvatar } from "../../chat/group-avatar";
import { formatChatMeta } from "../sidebar-helpers";

export type CharacterListProps = {
    activeCharacterId: string;
    activeChatId: string;
    activeGroupChat: boolean;
    characters: CharacterSummary[];
    filteredCharacters: CharacterSummary[];
    filteredGroupChats: ChatSummary[];
    groupChats: ChatSummary[];
    hasSidebarFilter: boolean;
    pendingCharacterId?: string;
    onOpenCharacterMenu: (event: MouseEvent, character: CharacterSummary) => void;
    onOpenChatMenu: (event: MouseEvent, chat: ChatSummary) => void;
    onSelectCharacter: (characterId: string) => void;
    onSelectChat: (chatId: string) => void;
};

export function CharacterList({
    activeCharacterId,
    activeChatId,
    activeGroupChat,
    characters,
    filteredCharacters,
    filteredGroupChats,
    groupChats,
    hasSidebarFilter,
    pendingCharacterId,
    onOpenCharacterMenu,
    onOpenChatMenu,
    onSelectCharacter,
    onSelectChat,
}: CharacterListProps) {
    const activeRowCharacterId = pendingCharacterId || activeCharacterId;

    return (
        <div className="character-list">
            {filteredCharacters.length > 0 ? (
                filteredCharacters.map((character) => {
                    const isPending = character.id === pendingCharacterId;
                    const isActive =
                        character.id === activeRowCharacterId && !activeGroupChat;

                    return (
                        <button
                            className={`character-row ${isActive ? "active" : ""} ${
                                isPending ? "pending" : ""
                            }`}
                            key={character.id}
                            type="button"
                            aria-busy={isPending ? "true" : undefined}
                            onClick={() => onSelectCharacter(character.id)}
                            onContextMenu={(event) =>
                                onOpenCharacterMenu(event, character)
                            }
                        >
                            {character.avatar ? (
                                <img
                                    className="avatar image-avatar"
                                    src={character.avatar.path}
                                    alt=""
                                />
                            ) : (
                                <img
                                    className="avatar image-avatar"
                                    src={characterInitialAvatar(character.name)}
                                    alt=""
                                />
                            )}
                            <span>
                                <strong>{character.name}</strong>
                                <small>
                                    {isPending
                                        ? "Switching..."
                                        : character.tagline || "No short description"}
                                </small>
                            </span>
                        </button>
                    );
                })
            ) : characters.length > 0 && hasSidebarFilter ? (
                <div className="rail-empty-state">
                    <strong>No matching characters</strong>
                    <span>Try a different filter.</span>
                </div>
            ) : (
                <div className="rail-empty-state">
                    <strong>No characters yet</strong>
                    <span>Create one or import a character card.</span>
                </div>
            )}
            {filteredGroupChats.length > 0 && (
                <>
                    <div className="rail-subtitle">Group chats</div>
                    {filteredGroupChats.map((chat) => (
                        <button
                            className={`character-row group-chat-row ${
                                chat.id === activeChatId ? "active" : ""
                            }`}
                            key={chat.id}
                            type="button"
                            onClick={() => onSelectChat(chat.id)}
                            onContextMenu={(event) => onOpenChatMenu(event, chat)}
                        >
                            <GroupAvatar
                                className="avatar"
                                customPath={
                                    chat.group?.avatar?.type === "custom"
                                        ? chat.group.avatar.path
                                        : undefined
                                }
                                members={chat.members ?? []}
                            />
                            <span>
                                <strong>{chatDisplayTitle(chat)}</strong>
                                <small>{formatChatMeta(chat)}</small>
                            </span>
                        </button>
                    ))}
                </>
            )}
            {groupChats.length > 0 &&
                filteredGroupChats.length === 0 &&
                hasSidebarFilter && (
                    <div className="rail-empty-state compact">
                        <strong>No matching group chats</strong>
                    </div>
                )}
        </div>
    );
}
