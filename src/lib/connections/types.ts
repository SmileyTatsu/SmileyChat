import type { Message } from "#frontend/types";

export type ChatGenerationMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type ChatGenerationMessage = {
    role: "developer" | "system" | "user" | "assistant";
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoningDetails?: unknown;
};

export type ChatGenerationRequest = {
    context?: string;
    messages: Message[];
    onImage?: (url: string) => void;
    onReasoningToken?: (token: string) => void;
    onToken?: (token: string) => void;
    promptMessages?: ChatGenerationMessage[];
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
    generate: (request: ChatGenerationRequest) => Promise<ChatGenerationResult>;
};
