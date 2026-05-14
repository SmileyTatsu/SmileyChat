import type { Message } from "../../types";

export type ChatGenerationMessage = {
    role: "developer" | "system" | "user" | "assistant";
    content: string;
};

export type ChatGenerationRequest = {
    context?: string;
    messages: Message[];
    onToken?: (token: string) => void;
    promptMessages?: ChatGenerationMessage[];
    stream?: boolean;
};

export type ChatGenerationResult = {
    message: string;
    provider: string;
    model?: string;
    raw?: unknown;
};

export type ConnectionAdapter = {
    id: string;
    label: string;
    generate: (request: ChatGenerationRequest) => Promise<ChatGenerationResult>;
};
