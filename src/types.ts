export type ChatMode = "chat" | "rp";

export type UserStatus = "online" | "away" | "dnd" | "offline";

export type SettingsCategory =
    | "connections"
    | "preset"
    | "personas"
    | "plugins"
    | "settings"
    | (string & {});

export const MessageRole = {
    Character: "character",
    System: "system",
    User: "user",
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export type Message = {
    id: string;
    author: string;
    authorCharacterId?: string;
    authorAvatarPath?: string;
    authorPersonaId?: string;
    metadata?: MessageMetadata;
    role: MessageRole;
    toolCalls?: MessageToolCall[];
    toolResult?: MessageToolResult;
    createdAt: string;
    activeSwipeIndex: number;
    swipes: MessageSwipe[];
};

export type MessageToolCall = {
    id: string;
    name: string;
    displayName?: string;
    argumentsText: string;
    arguments?: Record<string, unknown>;
    providerState?: unknown;
};

export type MessageToolResult = {
    toolCallId: string;
    name: string;
    content: string;
    isError?: boolean;
};

export type MessageToolActivity = {
    call: MessageToolCall;
    result: MessageToolResult;
    /** Present only while the tool call is still in flight. */
    status?: "running";
};

export type SwipeTimelineEntry =
    | {
          id: string;
          type: "thought";
          content: string;
          details?: unknown;
      }
    | {
          id: string;
          type: "tool";
          activity: MessageToolActivity;
      };

export type MessageMetadata = {
    origin?: "plugin";
    pluginId?: string;
    displayRole?: "system";
    includeInPrompt?: boolean;
    promptRole?: "assistant" | "user" | "system" | "none";
    canGenerateSwipe?: boolean;
    toolProtocol?: "assistant_tool_call";
    toolActivity?: {
        name: string;
        status: "running" | "complete" | "error";
        argumentsText?: string;
        result?: string;
    };
    authorDialogueColorSnapshot?: string;
};

export type ChatAttachment = {
    id: string;
    type: "image" | "file";
    url: string;
    mimeType?: string;
    name?: string;
    sizeBytes?: number;
};

export type MessageSwipe = {
    id: string;
    content: string;
    attachments?: ChatAttachment[];
    createdAt: string;
    reasoning?: string;
    reasoningDetails?: unknown;
    status?: "error";
    toolActivities?: MessageToolActivity[];
    timeline?: SwipeTimelineEntry[];
    pendingToolContinuation?: {
        profileId: string;
        generation?: import("./lib/presets/types").PresetGenerationSettings;
        toolCalls: MessageToolCall[];
    };
};

export type {
    ChatAuthorNote,
    ChatGroup,
    ChatGroupMember,
    ChatKind,
    ChatMetadata,
    ChatSession,
    ChatSummary,
    ChatSummaryCollection,
    GroupGenerationMode,
    GroupGreetingMode,
    GroupReplyOrder,
} from "./lib/chats/types";

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
