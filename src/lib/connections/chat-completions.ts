import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "#frontend/lib/messages";
import { MessageRole, type Message } from "#frontend/types";

import { messageContentToText } from "./images";
import { readChatCompletionStream } from "./streaming";
import type {
    ChatGenerationMessage,
    ChatGenerationMessageContentPart,
    ChatGenerationRequest,
    ChatGenerationResult,
    ToolCall,
    ToolDefinition,
} from "./types";
import { ChatGenerationMessageRole } from "./types";

type ChatCompletionMessage<TRole extends string> = {
    role: TRole | "tool";
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoning_details?: unknown;
    tool_call_id?: string;
    tool_calls?: ChatCompletionToolCall[];
};

export type ChatCompletionTool = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

type ChatCompletionToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};

type ChatCompletionResponse = {
    model?: string;
    choices: Array<{
        message?: {
            content?: string | null;
            images?: Array<{
                image_url?: {
                    url?: string;
                };
            }>;
            reasoning?: string | null;
            reasoning_content?: string | null;
            reasoning_details?: unknown;
            tool_calls?: ChatCompletionToolCall[];
        };
        error?: {
            message?: string;
        };
    }>;
};

type CreateMessagesOptions<TRole extends string> = {
    includeReasoningHistory?: boolean;
    mapHistoryRole: (message: Message) => TRole;
    mapPromptRole: (role: ChatGenerationMessage["role"]) => TRole;
};

type NormalizeResponseOptions = {
    allowImages?: boolean;
    emptyMessage: string;
    provider: string;
    providerErrorPrefix?: string;
};

type StreamOptions = NormalizeResponseOptions & {
    streamErrorPrefix: string;
};

export function splitLeadingSystemMessages(messages: ChatGenerationMessage[]) {
    const systemMessages: string[] = [];
    const conversationMessages: ChatGenerationMessage[] = [];
    let conversationStarted = false;

    for (const message of messages) {
        const isSystemInstruction =
            message.role === ChatGenerationMessageRole.Developer ||
            message.role === ChatGenerationMessageRole.System;

        if (
            !conversationStarted &&
            (message.role === ChatGenerationMessageRole.User ||
                message.role === ChatGenerationMessageRole.Assistant)
        ) {
            conversationStarted = true;
        }

        if (isSystemInstruction && !conversationStarted) {
            const text = messageContentToText(message.content).trim();
            if (text) {
                systemMessages.push(text);
            }
            continue;
        }

        conversationMessages.push(message);
    }

    return {
        systemText: systemMessages.join("\n\n"),
        conversationMessages,
    };
}

export function createChatCompletionMessages<TRole extends string>(
    request: ChatGenerationRequest,
    options: CreateMessagesOptions<TRole>,
): Array<ChatCompletionMessage<TRole>> {
    return request.promptMessages?.length
        ? request.promptMessages.map((message) =>
              toPromptMessage(message, {
                  includeReasoningHistory: options.includeReasoningHistory,
                  mapRole: options.mapPromptRole,
              }),
          )
        : legacyMessages(request, options);
}

export function normalizeChatCompletionResponse(
    response: ChatCompletionResponse,
    options: NormalizeResponseOptions,
): ChatGenerationResult {
    const firstChoice = response.choices[0];

    if (firstChoice?.error?.message) {
        throw new Error(
            options.providerErrorPrefix
                ? `${options.providerErrorPrefix}: ${firstChoice.error.message}`
                : firstChoice.error.message,
        );
    }

    const responseMessage = firstChoice?.message;
    const message = responseMessage?.content?.trim();
    const toolCalls = normalizeChatCompletionToolCalls(responseMessage?.tool_calls);
    const images = options.allowImages
        ? extractImageUrls(responseMessage?.images)
        : undefined;

    if (!message && !images?.length && !toolCalls.length) {
        throw new Error(options.emptyMessage);
    }

    return {
        message: message ?? "",
        ...(images?.length ? { images } : {}),
        provider: options.provider,
        model: response.model,
        ...((responseMessage?.reasoning ?? responseMessage?.reasoning_content)?.trim()
            ? {
                  reasoning: (
                      responseMessage?.reasoning ?? responseMessage?.reasoning_content
                  )?.trim(),
              }
            : {}),
        ...(responseMessage?.reasoning_details !== undefined
            ? { reasoningDetails: responseMessage.reasoning_details }
            : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        raw: response,
    };
}

export function chatCompletionTools(
    tools: ToolDefinition[] | undefined,
): ChatCompletionTool[] | undefined {
    if (!tools?.length) {
        return undefined;
    }

    return tools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

export async function consumeChatCompletionStream(
    response: Response,
    request: ChatGenerationRequest,
    options: StreamOptions,
): Promise<ChatGenerationResult> {
    let message = "";
    let model: string | undefined;
    let reasoning = "";
    let reasoningDetails: unknown;
    let finishReason: string | undefined;
    const images: string[] = [];
    const streamedToolCalls = new Map<
        number,
        {
            id?: string;
            name: string;
            argumentsText: string;
        }
    >();

    await readChatCompletionStream(
        response,
        (chunk) => {
            if (chunk.error?.message) {
                throw new Error(`${options.streamErrorPrefix}: ${chunk.error.message}`);
            }

            model = chunk.model ?? model;
            finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;

            const token = chunk.choices?.[0]?.delta?.content;
            const reasoningToken =
                chunk.choices?.[0]?.delta?.reasoning ??
                chunk.choices?.[0]?.delta?.reasoning_content;
            const nextReasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details;
            const nextImages = options.allowImages
                ? extractImageUrls(chunk.choices?.[0]?.delta?.images)
                : undefined;
            const nextToolCalls = chunk.choices?.[0]?.delta?.tool_calls;

            if (reasoningToken) {
                reasoning += reasoningToken;
                request.onReasoningToken?.(reasoningToken);
            }

            if (nextReasoningDetails !== undefined) {
                reasoningDetails = mergeReasoningDetails(
                    reasoningDetails,
                    nextReasoningDetails,
                );
            }

            if (token) {
                message += token;
                request.onToken?.(token);
            }

            if (nextImages?.length) {
                images.push(...nextImages);
                for (const url of nextImages) {
                    request.onImage?.(url);
                }
            }

            if (nextToolCalls?.length) {
                for (const toolCall of nextToolCalls) {
                    const index = toolCall.index ?? streamedToolCalls.size;
                    const current = streamedToolCalls.get(index) ?? {
                        id: undefined,
                        name: "",
                        argumentsText: "",
                    };

                    streamedToolCalls.set(index, {
                        id: toolCall.id ?? current.id,
                        name: `${current.name}${toolCall.function?.name ?? ""}`,
                        argumentsText: `${current.argumentsText}${toolCall.function?.arguments ?? ""}`,
                    });
                }
            }
        },
        request.signal,
    );

    const toolCalls = normalizeStreamedToolCalls(streamedToolCalls);

    if (!message.trim() && images.length === 0 && toolCalls.length === 0) {
        throw new Error(
            emptyStreamMessage(options.emptyMessage, finishReason, reasoning),
        );
    }

    return {
        message: message.trim(),
        ...(images.length ? { images } : {}),
        provider: options.provider,
        model,
        ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
    };
}

// Explain an empty streamed completion using the provider's finish_reason and
// whether any reasoning tokens arrived. This distinguishes a truncated budget
// ("length" with reasoning-only output) from a genuinely dropped stream.
function emptyStreamMessage(
    base: string,
    finishReason: string | undefined,
    reasoning: string,
): string {
    const details: string[] = [];

    if (finishReason) {
        details.push(`finish_reason=${finishReason}`);
    }

    if (reasoning.trim()) {
        details.push("reasoning tokens were received but no message content");
        if (finishReason === "length") {
            details.push(
                "the reasoning likely consumed the entire output token budget — raise max tokens or lower reasoning effort",
            );
        }
    } else if (!finishReason) {
        details.push("the provider stream ended early without any content");
    }

    return details.length ? `${base} (${details.join("; ")})` : base;
}

export function mergeReasoningDetails(current: unknown, next: unknown) {
    if (Array.isArray(current) && Array.isArray(next)) {
        return [...current, ...next];
    }

    if (Array.isArray(current)) {
        return [...current, next];
    }

    if (current !== undefined && Array.isArray(next)) {
        return [current, ...next];
    }

    if (current !== undefined) {
        return [current, next];
    }

    return next;
}

function toPromptMessage<TRole extends string>(
    message: ChatGenerationMessage,
    options: {
        includeReasoningHistory?: boolean;
        mapRole: (role: ChatGenerationMessage["role"]) => TRole;
    },
): ChatCompletionMessage<TRole> {
    if (message.toolResult) {
        return {
            role: "tool",
            tool_call_id: message.toolResult.toolCallId,
            content: message.toolResult.content,
        };
    }

    return {
        role: options.mapRole(message.role),
        content: message.content,
        ...(message.toolCalls?.length
            ? { tool_calls: message.toolCalls.map(toChatCompletionToolCall) }
            : {}),
        ...(options.includeReasoningHistory && message.reasoning
            ? { reasoning: message.reasoning }
            : {}),
        ...(options.includeReasoningHistory && message.reasoningDetails !== undefined
            ? { reasoning_details: message.reasoningDetails }
            : {}),
    };
}

function toHistoryMessage<TRole extends string>(
    message: Message,
    options: {
        includeReasoningHistory?: boolean;
        mapRole: (message: Message) => TRole;
    },
): ChatCompletionMessage<TRole> {
    const reasoning = getMessageReasoning(message);
    const reasoningDetails = getMessageReasoningDetails(message);

    return {
        role: options.mapRole(message),
        content: messageContentWithAttachments(message),
        ...(options.includeReasoningHistory && reasoning ? { reasoning } : {}),
        ...(options.includeReasoningHistory && reasoningDetails !== undefined
            ? { reasoning_details: reasoningDetails }
            : {}),
    };
}

function messageContentWithAttachments(
    message: Message,
): string | ChatGenerationMessageContentPart[] {
    const content = getMessageContent(message);
    const attachments = getMessageAttachments(message);

    if (attachments.length === 0) {
        return content;
    }

    return [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments.map((attachment) =>
            attachment.type === "image"
                ? {
                      type: "image_url" as const,
                      image_url: { url: attachment.url },
                  }
                : {
                      type: "file" as const,
                      file: {
                          url: attachment.url,
                          ...(attachment.name ? { filename: attachment.name } : {}),
                          ...(attachment.mimeType
                              ? { mime_type: attachment.mimeType }
                              : {}),
                          ...(attachment.sizeBytes !== undefined
                              ? { size_bytes: attachment.sizeBytes }
                              : {}),
                      },
                  },
        ),
    ];
}

function legacyMessages<TRole extends string>(
    request: ChatGenerationRequest,
    options: CreateMessagesOptions<TRole>,
): Array<ChatCompletionMessage<TRole>> {
    const messages = request.messages.map((message) =>
        toHistoryMessage(message, {
            includeReasoningHistory: options.includeReasoningHistory,
            mapRole: options.mapHistoryRole,
        }),
    );

    if (!request.context?.trim()) {
        return messages;
    }

    return [
        {
            role: options.mapPromptRole(ChatGenerationMessageRole.System),
            content: request.context,
        },
        ...messages,
    ];
}

function extractImageUrls(
    images:
        | Array<{
              image_url?: {
                  url?: string;
              };
          }>
        | undefined,
) {
    return images
        ?.map((image) => image.image_url?.url)
        .filter((url): url is string => typeof url === "string" && Boolean(url));
}

function normalizeChatCompletionToolCalls(
    toolCalls: ChatCompletionToolCall[] | undefined,
): ToolCall[] {
    return (toolCalls ?? [])
        .map((toolCall, index) => {
            const name = toolCall.function?.name?.trim();

            if (!name) {
                return undefined;
            }

            const argumentsText = toolCall.function?.arguments ?? "{}";
            const parsedArguments = parseToolArguments(argumentsText);

            return {
                id: toolCall.id || `tool-call-${index + 1}`,
                name,
                argumentsText,
                ...(parsedArguments ? { arguments: parsedArguments } : {}),
            };
        })
        .filter((toolCall): toolCall is ToolCall => toolCall !== undefined);
}

function toChatCompletionToolCall(toolCall: ToolCall): ChatCompletionToolCall {
    return {
        id: toolCall.id,
        type: "function",
        function: {
            name: toolCall.name,
            arguments: toolCall.argumentsText,
        },
    };
}

function normalizeStreamedToolCalls(
    streamedToolCalls: Map<
        number,
        {
            id?: string;
            name: string;
            argumentsText: string;
        }
    >,
): ToolCall[] {
    return [...streamedToolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, toolCall], index) => {
            const name = toolCall.name.trim();

            if (!name) {
                return undefined;
            }

            const argumentsText = toolCall.argumentsText || "{}";
            const parsedArguments = parseToolArguments(argumentsText);

            return {
                id: toolCall.id || `tool-call-${index + 1}`,
                name,
                argumentsText,
                ...(parsedArguments ? { arguments: parsedArguments } : {}),
            };
        })
        .filter((toolCall): toolCall is ToolCall => toolCall !== undefined);
}

export function parseToolArguments(
    value: string | Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (isPlainRecord(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return undefined;
    }

    try {
        const parsed = JSON.parse(value);
        return isPlainRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
