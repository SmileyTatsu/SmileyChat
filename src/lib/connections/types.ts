import type { Message } from "../../types";

export type ChatGenerationMessage = {
    role: "developer" | "system" | "user" | "assistant";
    content: string;
    reasoning?: string;
    reasoningDetails?: unknown;
};

export type ChatGenerationRequest = {
    context?: string;
    messages: Message[];
    onReasoningToken?: (token: string) => void;
    onToken?: (token: string) => void;
    promptMessages?: ChatGenerationMessage[];
    stream?: boolean;
};

export type ChatGenerationResult = {
    message: string;
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
