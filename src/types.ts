export type ChatMode = "chat" | "rp";

export type UserStatus = "online" | "away" | "dnd" | "offline";

export type SettingsCategory =
    | "connections"
    | "preset"
    | "personas"
    | "plugins"
    | "settings"
    | (string & {});

export type Message = {
    id: string;
    author: string;
    authorAvatarPath?: string;
    authorPersonaId?: string;
    role: "character" | "user";
    createdAt: string;
    activeSwipeIndex: number;
    swipes: MessageSwipe[];
};

export type MessageSwipe = {
    id: string;
    content: string;
    createdAt: string;
    reasoning?: string;
    reasoningDetails?: unknown;
    status?: "error";
};

export type { ChatSession, ChatSummary, ChatSummaryCollection } from "./lib/chats/types";

export type {
    CharacterCollection,
    CharacterSummary,
    CharacterSummaryCollection,
    SmileyCharacter,
    TavernCardDataV2,
} from "./lib/characters/types";

export type {
    PersonaIndex,
    PersonaSummary,
    PersonaSummaryCollection,
    SmileyPersona,
} from "./lib/personas/types";
