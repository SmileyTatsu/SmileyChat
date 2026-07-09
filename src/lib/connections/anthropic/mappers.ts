import { parseDataImageUrl } from "../images";
import { legacyMessages } from "../legacy-messages";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "../types";
import { ChatGenerationMessageRole } from "../types";
import type {
    AnthropicContentBlock,
    AnthropicCreateMessageRequest,
    AnthropicCreateMessageResponse,
    AnthropicMessage,
    AnthropicReasoningDetails,
    AnthropicRuntimeConfig,
    AnthropicThinkingConfig,
} from "./types";
import { defaultOutputTokenLimit } from "../output-tokens";
import {
    isClaudeOpus47OrLaterModel,
    stopSequencesForGeneration,
} from "../generation-settings";
import { splitLeadingSystemMessages } from "../chat-completions";

export function createAnthropicMessageBody(
    request: ChatGenerationRequest,
    config: AnthropicRuntimeConfig,
): AnthropicCreateMessageRequest {
    const promptMessages = request.promptMessages?.length
        ? request.promptMessages
        : legacyMessages(request);
    const { systemText, conversationMessages } =
        splitLeadingSystemMessages(promptMessages);
    const messages = mergeConsecutiveMessages(
        conversationMessages
            .map(toAnthropicMessage)
            .filter((message) => hasVisibleContent(message.content)),
    );
    const maxTokens = config.maxTokens ?? defaultOutputTokenLimit;
    const isOpus47OrLater = isClaudeOpus47OrLaterModel(config.model.id);
    const thinking = cleanAnthropicThinkingConfig(
        config.thinking,
        maxTokens,
        config.model.id,
    );
    const sampling = cleanAnthropicSamplingConfig(request.generation, config.model.id);

    if (messages.length === 0) {
        throw new Error(
            "Anthropic request needs at least one user or assistant message.",
        );
    }

    return {
        model: config.model.id,
        max_tokens: maxTokens,
        ...(systemText ? { system: systemText } : {}),
        messages,
        stream: request.stream === true,
        ...(stopSequencesForGeneration(request.generation)
            ? { stop_sequences: stopSequencesForGeneration(request.generation) }
            : {}),
        ...(!isOpus47OrLater ? sampling : {}),
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
    maxTokens: number,
    modelId = "",
): AnthropicCreateMessageRequest["thinking"] | undefined {
    if (!thinking || thinking.mode === "off") {
        return undefined;
    }

    if (maxTokens <= 1) {
        return undefined;
    }

    if (isClaudeOpus47OrLaterModel(modelId)) {
        return {
            type: "adaptive",
            ...(thinking.mode === "adaptive" && thinking.effort
                ? { effort: thinking.effort }
                : {}),
            ...(thinking.display ? { display: thinking.display } : {}),
        };
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

function cleanAnthropicSamplingConfig(
    generation: ChatGenerationRequest["generation"],
    modelId: string,
): Pick<AnthropicCreateMessageRequest, "temperature" | "top_k" | "top_p"> {
    if (!generation || isClaudeOpus47OrLaterModel(modelId)) {
        return {};
    }

    const output: Pick<AnthropicCreateMessageRequest, "temperature" | "top_k" | "top_p"> =
        {};

    if (typeof generation.temperature === "number") {
        output.temperature = Math.min(1, generation.temperature);
    }

    if (typeof generation.topP === "number" && output.temperature === undefined) {
        output.top_p = generation.topP;
    }

    if (typeof generation.topK === "number") {
        output.top_k = generation.topK;
    }

    return output;
}

function toAnthropicMessage(message: ChatGenerationMessage): AnthropicMessage {
    return {
        role: message.role === ChatGenerationMessageRole.Assistant ? "assistant" : "user",
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

        if (part.type === "file") {
            if (!part.file.url) {
                throw new Error(
                    "Anthropic file input must be uploaded before generation.",
                );
            }

            if (part.file.mime_type?.startsWith("image/")) {
                imageBlocks.push({
                    type: "image",
                    source: {
                        type: "file",
                        file_id: part.file.url,
                    },
                });
                continue;
            }

            imageBlocks.push({
                type: "document",
                source: {
                    type: "file",
                    file_id: part.file.url,
                },
                ...(part.file.filename ? { title: part.file.filename } : {}),
            });
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
        (block) =>
            (block.type === "text" && block.text.trim()) ||
            block.type === "image" ||
            block.type === "document",
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
