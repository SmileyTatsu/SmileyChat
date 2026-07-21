import type {
    ChatMode,
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import type { ChatGenerationMessage } from "../connections/types";
import type { Lorebook } from "../lorebooks/types";
import type { AppPreferences } from "../preferences/types";
import type { SmileyPreset } from "../presets/types";

export type PromptGenerationTrigger =
    | "send"
    | "swipe"
    | "regenerate"
    | "continue"
    | "auto-group"
    | "plugin"
    | "quiet";

export type PromptGenerationContext = {
    activeCharacterId: string;
    forcedCharacterId?: string;
    stream: boolean;
    targetMessageId?: string;
    trigger: PromptGenerationTrigger;
};

export type PromptAnchor =
    | "before-character"
    | "after-character"
    | "before-examples"
    | "after-examples"
    | "before-scenario"
    | "after-scenario"
    | "before-history"
    | "after-history"
    | "at-depth"
    | "outlet";

export type PromptBuildContext = {
    chat: ChatSession;
    character: SmileyCharacter;
    group?: {
        joinPrefix?: string;
        memberIds?: string[];
    };
    groupCharacters: SmileyCharacter[];
    generation: PromptGenerationContext;
    lorebooks: Lorebook[];
    metadata?: Record<string, unknown>;
    messages: Message[];
    mode: ChatMode;
    persona: SmileyPersona;
    preferences: AppPreferences;
    preset: SmileyPreset | undefined;
    tokenBudget: number;
    userStatus: UserStatus;
};

export type PromptInjection = {
    id: string;
    source: "core" | "plugin" | "lorebook" | "preset";
    role: ChatGenerationMessage["role"];
    content: string;
    anchor: PromptAnchor;
    depth?: number;
    order: number;
    priority?: number;
    outletName?: string;
    tokenBudgetBehavior?: "counted" | "ignore-budget";
    metadata?: Record<string, unknown>;
};

export type PromptBudgetPlan = {
    availableHistoryTokens: number;
    injectionTokens: number;
    reservedTokens: number;
    staticPromptTokens: number;
    tokenBudget: number;
};

export type PromptBuildDebug = {
    blocks: PromptDebugBlock[];
    budget: PromptBudgetPlan;
    injections: PromptInjection[];
    selectedMessageIds: string[];
    tokenEstimate: number;
    trimmedMessageIds: string[];
    warnings: string[];
};

export type PromptDebugBlock = {
    /** Matches a compiled message so its label can survive prompt middleware. */
    messageFingerprint: string;
    kind: "prompt" | "source";
    label: string;
    source: "history" | "injection" | "preset" | "middleware";
};

export type PromptContextMiddleware = (
    context: PromptBuildContext,
) => PromptBuildContext | Promise<PromptBuildContext>;

export type PromptInjector = (
    context: PromptBuildContext,
) => PromptInjection[] | Promise<PromptInjection[]>;

export type PromptBuildResult = {
    debug: PromptBuildDebug;
    messages: Message[];
    promptMessages: ChatGenerationMessage[];
};
