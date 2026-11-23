import { MessageSquare, Star } from "lucide-preact";

import { chatDisplayTitle, isGroupChat } from "#frontend/lib/chats/normalize";
import type { ChatSummary } from "#frontend/types";

import { GroupAvatar } from "../../chat/group-avatar";
import { formatChatMeta } from "../sidebar-helpers";

export type ChatListProps = {
    activeChatId: string;
    characterNamesById?: Record<string, string>;
    filteredDirectChats: ChatSummary[];
    hasCharacters: boolean;
    hasSidebarFilter: boolean;
    onOpenChatMenu: (event: MouseEvent, chat: ChatSummary) => void;
    onSelectChat: (chatId: string) => void;
    onToggleFavorite?: (chat: ChatSummary) => void;
};

export function ChatList({
    activeChatId,
    characterNamesById,
    filteredDirectChats,
    hasCharacters,
    hasSidebarFilter,
    onOpenChatMenu,
    onSelectChat,
    onToggleFavorite,
}: ChatListProps) {
    return (
        <div className="chat-list">
            {filteredDirectChats.length > 0 ? (
                filteredDirectChats.map((chat) => {
                    const isFavorite = Boolean(chat.metadata?.isFavorite);

                    return (
                        // A div, not a button: the favorite toggle lives inside the row.
                        <div
                            className={`chat-row ${chat.id === activeChatId ? "active" : ""}`}
                            data-favorite={isFavorite ? "true" : "false"}
                            key={chat.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectChat(chat.id)}
                            onContextMenu={(event) => onOpenChatMenu(event, chat)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                    return;
                                }

                                event.preventDefault();
                                onSelectChat(chat.id);
                            }}
                        >
                            {isGroupChat(chat) ? (
                                <GroupAvatar
                                    className="chat-row-avatar"
                                    customPath={
                                        chat.group?.avatar?.type === "custom"
                                            ? chat.group.avatar.path
                                            : undefined
                                    }
                                    members={chat.members ?? []}
                                />
                            ) : (
                                <span className="chat-row-avatar direct-chat-avatar">
                                    <MessageSquare size={15} />
                                </span>
                            )}
                            <span className="chat-row-text">
                                <strong>{chatDisplayTitle(chat)}</strong>
                                <small>
                                    {!isGroupChat(chat) &&
                                    characterNamesById?.[chat.characterId]
                                        ? `${characterNamesById[chat.characterId]} · `
                                        : ""}
                                    {formatChatMeta(chat)}
                                </small>
                            </span>
                            {onToggleFavorite && (
                                <button
                                    className="chat-row-favorite"
                                    type="button"
                                    aria-pressed={isFavorite}
                                    aria-label={
                                        isFavorite
                                            ? "Remove from favorites"
                                            : "Add to favorites"
                                    }
                                    title={
                                        isFavorite
                                            ? "Remove from favorites"
                                            : "Add to favorites"
                                    }
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleFavorite(chat);
                                    }}
                                >
                                    <Star
                                        size={13}
                                        fill={isFavorite ? "currentColor" : "none"}
                                    />
                                </button>
                            )}
                        </div>
                    );
                })
            ) : hasSidebarFilter ? (
                <div className="rail-empty-state">
                    <strong>No matching chats</strong>
                    <span>Try a different filter.</span>
                </div>
            ) : (
                <div className="rail-empty-state">
                    <strong>No chats yet</strong>
                    <span>
                        {hasCharacters
                            ? "Start a chat when you are ready."
                            : "Create a character before starting a chat."}
                    </span>
                </div>
            )}
        </div>
    );
}
