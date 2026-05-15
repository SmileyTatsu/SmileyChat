import type { ChatMode, Message } from "#frontend/types";

export type ChatSession = {
    id: string;
    version: 1;
    characterId: string;
    defaultTitle: string;
    title?: string;
    mode: ChatMode;
    messages: Message[];
    createdAt: string;
    updatedAt: string;
};

export type ChatSummary = {
    id: string;
    characterId: string;
    defaultTitle: string;
    title?: string;
    mode: ChatMode;
    messageCount: number;
    lastMessageAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type ChatSummaryCollection = {
    version: 1;
    activeChatIdsByCharacter: Record<string, string>;
    chats: ChatSummary[];
};

export type ChatIndex = {
    version: 1;
    activeChatIdsByCharacter: Record<string, string>;
    chatIds: string[];
};
