import { MessageSquare } from "lucide-preact";

import { chatDisplayTitle, isGroupChat } from "#frontend/lib/chats/normalize";
import type { ChatSummary } from "#frontend/types";

import { GroupAvatar } from "../../chat/group-avatar";
import { formatChatMeta } from "../sidebar-helpers";

export type ChatListProps = {
    activeChatId: string;
    directChats: ChatSummary[];
    filteredDirectChats: ChatSummary[];
    hasCharacters: boolean;
    hasSidebarFilter: boolean;
    onOpenChatMenu: (event: MouseEvent, chat: ChatSummary) => void;
    onSelectChat: (chatId: string) => void;
};

export function ChatList({
    activeChatId,
    directChats,
    filteredDirectChats,
    hasCharacters,
    hasSidebarFilter,
    onOpenChatMenu,
    onSelectChat,
}: ChatListProps) {
    return (
        <div className="chat-list">
            {filteredDirectChats.length > 0 ? (
                filteredDirectChats.map((chat) => (
                    <button
                        className={`chat-row ${chat.id === activeChatId ? "active" : ""}`}
                        key={chat.id}
                        type="button"
                        onClick={() => onSelectChat(chat.id)}
                        onContextMenu={(event) => onOpenChatMenu(event, chat)}
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
                        <span>
                            <strong>{chatDisplayTitle(chat)}</strong>
                            <small>{formatChatMeta(chat)}</small>
                        </span>
                    </button>
                ))
            ) : directChats.length > 0 && hasSidebarFilter ? (
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
