import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
    getMessageReasoningDetails,
} from "#frontend/lib/messages";
import type { Message } from "#frontend/types";

import { readChatCompletionStream } from "./streaming";
import type {
    ChatGenerationMessage,
    ChatGenerationMessageContentPart,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "./types";

type ChatCompletionMessage<TRole extends string> = {
    role: TRole;
    content: string | ChatGenerationMessageContentPart[];
    reasoning?: string;
    reasoning_details?: unknown;
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
            reasoning_details?: unknown;
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
    const images = options.allowImages
        ? extractImageUrls(responseMessage?.images)
        : undefined;

    if (!message && !images?.length) {
        throw new Error(options.emptyMessage);
    }

    return {
        message: message ?? "",
        ...(images?.length ? { images } : {}),
        provider: options.provider,
        model: response.model,
        ...(responseMessage?.reasoning?.trim()
            ? { reasoning: responseMessage.reasoning.trim() }
            : {}),
        ...(responseMessage?.reasoning_details !== undefined
            ? { reasoningDetails: responseMessage.reasoning_details }
            : {}),
        raw: response,
    };
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
    const images: string[] = [];

    await readChatCompletionStream(response, (chunk) => {
        if (chunk.error?.message) {
            throw new Error(`${options.streamErrorPrefix}: ${chunk.error.message}`);
        }

        model = chunk.model ?? model;

        const token = chunk.choices?.[0]?.delta?.content;
        const reasoningToken = chunk.choices?.[0]?.delta?.reasoning;
        const nextReasoningDetails = chunk.choices?.[0]?.delta?.reasoning_details;
        const nextImages = options.allowImages
            ? extractImageUrls(chunk.choices?.[0]?.delta?.images)
            : undefined;

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
    }, request.signal);

    if (!message.trim() && images.length === 0) {
        throw new Error(options.emptyMessage);
    }

    return {
        message: message.trim(),
        ...(images.length ? { images } : {}),
        provider: options.provider,
        model,
        ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
    };
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
    return {
        role: options.mapRole(message.role),
        content: message.content,
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
        ...attachments.map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.url },
        })),
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
            role: options.mapPromptRole("system"),
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
