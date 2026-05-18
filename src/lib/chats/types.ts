import type { ChatMode, Message } from "#frontend/types";

export type ChatKind = "direct" | "group";

export type GroupReplyOrder = "natural" | "list" | "pooled";

export type GroupGenerationMode = "swap-character-cards" | "join-character-cards";

export type GroupGreetingMode = "all" | "first" | "none";

export type ChatGroupMember = {
    characterId: string;
    name: string;
    avatarPath?: string;
    muted?: boolean;
    order: number;
    talkativeness?: number;
};

export type ChatGroup = {
    title?: string;
    avatar?: {
        type: "collage" | "custom";
        path?: string;
    };
    autoResponses?: {
        enabled: boolean;
        chance: number;
        delayMs: number;
        maxTurns: number;
    };
    replyOrder: GroupReplyOrder;
    generationMode: GroupGenerationMode;
    allowSelfResponses?: boolean;
    greetingMode?: GroupGreetingMode;
    joinPrefix?: string;
    scenarioOverride?: string;
};

export type ChatSession = {
    id: string;
    version: 1;
    kind?: ChatKind;
    characterId: string;
    members?: ChatGroupMember[];
    group?: ChatGroup;
    defaultTitle: string;
    title?: string;
    mode: ChatMode;
    messages: Message[];
    createdAt: string;
    updatedAt: string;
};

export type ChatSummary = {
    id: string;
    kind?: ChatKind;
    characterId: string;
    members?: ChatGroupMember[];
    group?: ChatGroup;
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
