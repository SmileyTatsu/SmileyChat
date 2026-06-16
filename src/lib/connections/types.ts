import type { Message } from "#frontend/types";
import type { PromptBuildDebug } from "../prompt/types";
import type { PresetGenerationSettings } from "../presets/types";

export type ChatGenerationMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export const ChatGenerationMessageRole = {
    Assistant: "assistant",
    Developer: "developer",
    System: "system",
    User: "user",
} as const;

export type ChatGenerationMessageRole =
    (typeof ChatGenerationMessageRole)[keyof typeof ChatGenerationMessageRole];

export type ChatGenerationMessage = {
    role: ChatGenerationMessageRole;
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoningDetails?: unknown;
};

export type ChatGenerationRequest = {
    context?: string;
    debug?: PromptBuildDebug;
    generation?: PresetGenerationSettings;
    messages: Message[];
    onImage?: (url: string) => void;
    onReasoningToken?: (token: string) => void;
    onToken?: (token: string) => void;
    promptMessages?: ChatGenerationMessage[];
    signal?: AbortSignal;
    stream?: boolean;
};

export type ChatGenerationResult = {
    message: string;
    images?: string[];
    provider: string;
    model?: string;
    reasoning?: string;
    reasoningDetails?: unknown;
    raw?: unknown;
};

export type ConnectionAdapter = {
    id: string;
    label: string;
    buildPayload: (request: ChatGenerationRequest) => Promise<unknown> | unknown;
    generate: (request: ChatGenerationRequest) => Promise<ChatGenerationResult>;
};
