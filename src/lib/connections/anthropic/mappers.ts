import { getMessageContent } from "#frontend/lib/messages";
import type { Message } from "#frontend/types";

import { messageContentToText, parseDataImageUrl } from "../images";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "../types";
import type {
    AnthropicContentBlock,
    AnthropicCreateMessageRequest,
    AnthropicCreateMessageResponse,
    AnthropicMessage,
    AnthropicReasoningDetails,
    AnthropicRuntimeConfig,
    AnthropicThinkingConfig,
} from "./types";

const defaultMaxTokens = 1024;

export function createAnthropicMessageBody(
    request: ChatGenerationRequest,
    config: AnthropicRuntimeConfig,
): AnthropicCreateMessageRequest {
    const promptMessages = request.promptMessages?.length
        ? request.promptMessages
        : legacyMessages(request);
    const system = promptMessages
        .filter((message) => message.role === "developer" || message.role === "system")
        .map((message) => messageContentToText(message.content).trim())
        .filter(Boolean)
        .join("\n\n");
    const messages = mergeConsecutiveMessages(
        promptMessages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map(toAnthropicMessage)
            .filter((message) => hasVisibleContent(message.content)),
    );
    const thinking = cleanAnthropicThinkingConfig(config.thinking, defaultMaxTokens);

    if (messages.length === 0) {
        throw new Error(
            "Anthropic request needs at least one user or assistant message.",
        );
    }

    return {
        model: config.model.id,
        max_tokens: defaultMaxTokens,
        ...(system ? { system } : {}),
        messages,
        stream: request.stream === true,
        ...(thinking ? { thinking } : {}),
    };
}

export function normalizeAnthropicResponse(
    response: AnthropicCreateMessageResponse,
): ChatGenerationResult {
    const message = extractAnthropicText(response).trim();
    const reasoning = extractAnthropicThinking(response).trim();
    const reasoningDetails = createAnthropicReasoningDetails(response, message);

    if (!message) {
        const hasToolUse = response.content?.some((block) => block.type === "tool_use");
        const reason = response.stop_reason;

        throw new Error(
            hasToolUse
                ? "Anthropic response requested tool use, which SmileyChat does not support yet."
                : reason
                  ? `Anthropic response did not include message content: ${reason}`
                  : "Anthropic response did not include message content.",
        );
    }

    return {
        message,
        provider: "anthropic",
        model: response.model,
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails ? { reasoningDetails } : {}),
        raw: response,
    };
}

export function extractAnthropicText(response: AnthropicCreateMessageResponse) {
    return (
        response.content
            ?.filter((block) => block.type === "text")
            .map((block) => ("text" in block ? block.text : ""))
            .join("") ?? ""
    );
}

export function extractAnthropicThinking(response: AnthropicCreateMessageResponse) {
    return (
        response.content
            ?.filter((block) => block.type === "thinking")
            .map((block) => ("thinking" in block ? (block.thinking ?? "") : ""))
            .join("") ?? ""
    );
}

export function createAnthropicReasoningDetails(
    response: AnthropicCreateMessageResponse,
    visibleText = extractAnthropicText(response).trim(),
): AnthropicReasoningDetails | undefined {
    const content = response.content?.filter(
        (block) => block.type === "thinking" || block.type === "redacted_thinking",
    );

    if (!content?.length && !response.usage && !response.stop_reason) {
        return undefined;
    }

    return {
        anthropic: {
            ...(content?.length ? { content } : {}),
            ...(response.stop_reason !== undefined
                ? { stopReason: response.stop_reason }
                : {}),
            ...(response.usage ? { usage: response.usage } : {}),
            visibleText,
        },
    };
}

export function cleanAnthropicThinkingConfig(
    thinking: AnthropicThinkingConfig | undefined,
    maxTokens = defaultMaxTokens,
): AnthropicCreateMessageRequest["thinking"] | undefined {
    if (!thinking || thinking.mode === "off") {
        return undefined;
    }

    if (thinking.mode === "adaptive") {
        return {
            type: "adaptive",
            ...(thinking.effort ? { effort: thinking.effort } : {}),
            ...(thinking.display ? { display: thinking.display } : {}),
        };
    }

    const budgetTokens =
        typeof thinking.budgetTokens === "number" &&
        Number.isInteger(thinking.budgetTokens) &&
        thinking.budgetTokens > 0
            ? Math.min(thinking.budgetTokens, Math.max(1, maxTokens - 1))
            : Math.max(1, Math.min(512, maxTokens - 1));

    return {
        type: "enabled",
        budget_tokens: budgetTokens,
        ...(thinking.display ? { display: thinking.display } : {}),
    };
}

function toAnthropicMessage(message: ChatGenerationMessage): AnthropicMessage {
    return {
        role: message.role === "assistant" ? "assistant" : "user",
        content: generationMessageContentToAnthropicContent(message.content),
    };
}

function generationMessageContentToAnthropicContent(
    content: ChatGenerationMessage["content"],
): string | AnthropicContentBlock[] {
    if (typeof content === "string") {
        return content;
    }

    const imageBlocks: AnthropicContentBlock[] = [];
    const textBlocks: AnthropicContentBlock[] = [];

    for (const part of content) {
        if (part.type === "text") {
            textBlocks.push({ type: "text", text: part.text });
            continue;
        }

        const image = parseDataImageUrl(part.image_url.url);

        if (!image) {
            if (/^https?:\/\//i.test(part.image_url.url)) {
                imageBlocks.push({
                    type: "image",
                    source: {
                        type: "url",
                        url: part.image_url.url,
                    },
                });
                continue;
            }

            throw new Error("Anthropic image input must be a base64 data URL.");
        }

        imageBlocks.push({
            type: "image",
            source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.data,
            },
        });
    }

    return [...imageBlocks, ...textBlocks];
}

function mergeConsecutiveMessages(messages: AnthropicMessage[]) {
    const merged: AnthropicMessage[] = [];

    for (const message of messages) {
        const previous = merged[merged.length - 1];

        if (previous?.role === message.role) {
            previous.content = mergeAnthropicContent(previous.content, message.content);
            continue;
        }

        merged.push({
            role: message.role,
            content: message.content,
        });
    }

    return merged;
}

function mergeAnthropicContent(
    left: AnthropicMessage["content"],
    right: AnthropicMessage["content"],
): AnthropicMessage["content"] {
    if (typeof left === "string" && typeof right === "string") {
        return `${left}\n${right}`;
    }

    const leftBlocks =
        typeof left === "string" ? [{ type: "text" as const, text: left }] : left;
    const rightBlocks =
        typeof right === "string" ? [{ type: "text" as const, text: right }] : right;

    if (leftBlocks.every(isTextOnlyBlock) && rightBlocks.every(isTextOnlyBlock)) {
        return [
            {
                type: "text",
                text: `${blocksToText(leftBlocks)}\n${blocksToText(rightBlocks)}`,
            },
        ];
    }

    return [...leftBlocks, { type: "text", text: "\n" }, ...rightBlocks];
}

function hasVisibleContent(content: AnthropicMessage["content"]) {
    if (typeof content === "string") {
        return Boolean(content.trim());
    }

    return content.some(
        (block) => (block.type === "text" && block.text.trim()) || block.type === "image",
    );
}

function isTextOnlyBlock(block: AnthropicContentBlock) {
    return block.type === "text";
}

function blocksToText(blocks: AnthropicContentBlock[]) {
    return blocks
        .filter(isTextOnlyBlock)
        .map((block) => block.text)
        .join("");
}

function toPromptMessage(message: Message): ChatGenerationMessage {
    return {
        role: message.role === "user" ? "user" : "assistant",
        content: getMessageContent(message),
    };
}

function legacyMessages(request: ChatGenerationRequest): ChatGenerationMessage[] {
    const messages = request.messages.map(toPromptMessage);

    if (!request.context?.trim()) {
        return messages;
    }

    return [
        {
            role: "system",
            content: request.context,
        },
        ...messages,
    ];
}
