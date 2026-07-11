import type { Message } from "#frontend/types";
import type { PromptBuildDebug } from "../prompt/types";
import type { PresetGenerationSettings } from "../presets/types";

export type ChatGenerationMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | {
          type: "file";
          file: {
              filename?: string;
              file_data?: string;
              mime_type?: string;
              size_bytes?: number;
              url?: string;
          };
      };

export type ToolDefinition = {
    name: string;
    displayName?: string;
    description: string;
    parameters: Record<string, unknown>;
};

export type ToolCall = {
    id: string;
    name: string;
    displayName?: string;
    argumentsText: string;
    arguments?: Record<string, unknown>;
    /** Provider-specific content that must be replayed verbatim on the next turn. */
    providerState?: unknown;
};

export type ToolResult = {
    toolCallId: string;
    name: string;
    content: string;
    isError?: boolean;
};

export type ToolActivity = {
    call: ToolCall;
    result: ToolResult;
};

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
    toolCalls?: ToolCall[];
    toolResult?: ToolResult;
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
    tools?: ToolDefinition[];
};

export type ChatGenerationResult = {
    message: string;
    images?: string[];
    provider: string;
    model?: string;
    reasoning?: string;
    reasoningDetails?: unknown;
    raw?: unknown;
    toolCalls?: ToolCall[];
    toolActivities?: ToolActivity[];
};

export type ConnectionAdapter = {
    id: string;
    label: string;
    buildPayload: (request: ChatGenerationRequest) => Promise<unknown> | unknown;
    generate: (request: ChatGenerationRequest) => Promise<ChatGenerationResult>;
};
