import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
    ToolCall,
} from "../types";
import { ChatGenerationMessageRole } from "../types";
import { messageContentToText, parseDataImageUrl } from "../images";
import { legacyMessages } from "../legacy-messages";
import { defaultOutputTokenLimit } from "../output-tokens";
import { stopSequencesForGeneration } from "../generation-settings";
import { splitLeadingSystemMessages } from "../chat-completions";
import { parseToolArguments } from "../chat-completions";
import type {
    GoogleAIContent,
    GoogleAIGenerateContentRequest,
    GoogleAIGenerateContentResponse,
    GoogleAIPart,
    GoogleAIReasoningDetails,
    GoogleAIRuntimeConfig,
    GoogleAIThinkingConfig,
} from "./types";

type GoogleAIRole = "user" | "model";

export function createGoogleAIGenerateBody(
    request: ChatGenerationRequest,
    config: GoogleAIRuntimeConfig,
): GoogleAIGenerateContentRequest {
    const messages = request.promptMessages?.length
        ? request.promptMessages
        : legacyMessages(request);
    const { systemText, conversationMessages } = splitLeadingSystemMessages(messages);
    const contents = mergeConsecutiveContents(
        conversationMessages
            .map(toGoogleAIContent)
            .filter((content) => content.parts.some(hasVisiblePart)),
    );
    const thinkingConfig = cleanThinkingConfig(config.thinking);
    const generationConfig: GoogleAIGenerateContentRequest["generationConfig"] = {
        maxOutputTokens: config.maxOutputTokens ?? defaultOutputTokenLimit,
        ...(typeof request.generation?.temperature === "number"
            ? { temperature: request.generation.temperature }
            : {}),
        ...(typeof request.generation?.topP === "number"
            ? { topP: request.generation.topP }
            : {}),
        ...(typeof request.generation?.topK === "number"
            ? { topK: request.generation.topK }
            : {}),
        ...(typeof request.generation?.presencePenalty === "number"
            ? { presencePenalty: request.generation.presencePenalty }
            : {}),
        ...(typeof request.generation?.frequencyPenalty === "number"
            ? { frequencyPenalty: request.generation.frequencyPenalty }
            : {}),
        ...(typeof request.generation?.seed === "number"
            ? { seed: request.generation.seed }
            : {}),
        ...(stopSequencesForGeneration(request.generation)
            ? { stopSequences: stopSequencesForGeneration(request.generation) }
            : {}),
        ...(thinkingConfig ? { thinkingConfig } : {}),
    };

    if (contents.length === 0) {
        throw new Error(
            "Google AI request needs at least one user or assistant message.",
        );
    }

    return {
        ...(systemText
            ? {
                  systemInstruction: {
                      parts: [{ text: systemText }],
                  },
              }
            : {}),
        contents,
        generationConfig,
        ...(request.tools?.length
            ? {
                  tools: [
                      {
                          functionDeclarations: request.tools.map((tool) => ({
                              name: tool.name,
                              description: tool.description,
                              parameters: tool.parameters,
                          })),
                      },
                  ],
              }
            : {}),
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE",
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE",
            },
        ],
    };
}

export function normalizeGoogleAIResponse(
    response: GoogleAIGenerateContentResponse,
): ChatGenerationResult {
    if (response.promptFeedback?.blockReason) {
        throw new Error(
            `Google AI prompt blocked: ${response.promptFeedback.blockReason}`,
        );
    }

    const candidate = response.candidates?.[0];
    const message = extractGoogleAIText(response).trim();
    const images = extractGoogleAIImages(response);
    const reasoning = extractGoogleAIThoughtText(response).trim();
    const reasoningDetails = createGoogleAIReasoningDetails(response, message);
    const toolCalls = extractGoogleAIToolCalls(response);

    if (!message && images.length === 0 && toolCalls.length === 0) {
        const reason = candidate?.finishMessage || candidate?.finishReason;
        throw new Error(
            reason
                ? `Google AI response did not include message content: ${reason}`
                : "Google AI response did not include message content.",
        );
    }

    return {
        message,
        ...(images.length ? { images } : {}),
        provider: "google-ai",
        model: response.modelVersion,
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails ? { reasoningDetails } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        raw: response,
    };
}

export function extractGoogleAIImages(response: GoogleAIGenerateContentResponse) {
    return (
        response.candidates?.[0]?.content?.parts
            ?.map((part) =>
                part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data
                    ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                    : "",
            )
            .filter(Boolean) ?? []
    );
}

export function extractGoogleAIText(response: GoogleAIGenerateContentResponse) {
    return (
        response.candidates?.[0]?.content?.parts
            ?.filter((part) => !part.thought)
            .map((part) => part.text ?? "")
            .join("") ?? ""
    );
}

export function extractGoogleAIThoughtText(response: GoogleAIGenerateContentResponse) {
    return (
        response.candidates?.[0]?.content?.parts
            ?.filter((part) => part.thought)
            .map((part) => part.text ?? "")
            .join("") ?? ""
    );
}

export function createGoogleAIReasoningDetails(
    response: GoogleAIGenerateContentResponse,
    visibleText = extractGoogleAIText(response).trim(),
): GoogleAIReasoningDetails | undefined {
    const parts = response.candidates?.[0]?.content?.parts;
    const hasSignedParts = parts?.some(hasThoughtSignature) ?? false;
    const usageMetadata = response.usageMetadata;

    if (!hasSignedParts && !usageMetadata) {
        return undefined;
    }

    return {
        googleAI: {
            ...(parts?.length ? { parts } : {}),
            ...(usageMetadata ? { usageMetadata } : {}),
            visibleText,
        },
    };
}

export function cleanThinkingConfig(thinking: GoogleAIThinkingConfig | undefined) {
    if (!thinking) {
        return undefined;
    }

    const output: NonNullable<
        GoogleAIGenerateContentRequest["generationConfig"]
    >["thinkingConfig"] = {};

    if (typeof thinking.includeThoughts === "boolean") {
        output.includeThoughts = thinking.includeThoughts;
    }

    if (thinking.mode === "level" && thinking.thinkingLevel) {
        output.thinkingLevel = thinking.thinkingLevel;
    }

    if (
        thinking.mode === "budget" &&
        typeof thinking.thinkingBudget === "number" &&
        Number.isInteger(thinking.thinkingBudget) &&
        (thinking.thinkingBudget === -1 || thinking.thinkingBudget >= 0)
    ) {
        output.thinkingBudget = thinking.thinkingBudget;
    }

    return Object.keys(output).length ? output : undefined;
}

function toGoogleAIContent(message: ChatGenerationMessage): GoogleAIContent {
    if (message.toolResult) {
        return {
            role: "user",
            parts: [
                {
                    functionResponse: {
                        id: message.toolResult.toolCallId,
                        name: message.toolResult.name,
                        response: {
                            result: message.toolResult.content,
                            ...(message.toolResult.isError ? { error: true } : {}),
                        },
                    },
                },
            ],
        };
    }

    if (message.toolCalls?.length) {
        return {
            role: "model",
            parts: [
                ...(typeof message.content === "string" && message.content.trim()
                    ? [{ text: message.content }]
                    : typeof message.content === "string"
                      ? []
                      : generationMessageContentToGoogleAIParts(message.content)),
                ...message.toolCalls.map((toolCall) => {
                    const providerState =
                        toolCall.providerState &&
                        typeof toolCall.providerState === "object" &&
                        !Array.isArray(toolCall.providerState) &&
                        isGoogleAIPart(toolCall.providerState)
                            ? toolCall.providerState
                            : undefined;

                    if (providerState?.functionCall) {
                        return providerState;
                    }

                    return {
                        functionCall: {
                            id: toolCall.id,
                            name: toolCall.name,
                            args:
                                toolCall.arguments ??
                                parseToolArguments(toolCall.argumentsText) ??
                                {},
                        },
                    };
                }),
            ],
        };
    }

    const replayParts = replayGoogleAIParts(message);

    if (replayParts) {
        return {
            role: "model",
            parts: replayParts,
        };
    }

    return {
        role: message.role === ChatGenerationMessageRole.Assistant ? "model" : "user",
        parts: generationMessageContentToGoogleAIParts(message.content),
    };
}

function mergeConsecutiveContents(contents: GoogleAIContent[]) {
    const merged: GoogleAIContent[] = [];

    for (const content of contents) {
        const role = content.role as GoogleAIRole | undefined;
        if (!role || !content.parts.some(hasVisiblePart)) {
            continue;
        }

        const previous = merged[merged.length - 1];

        if (
            previous?.role === role &&
            !hasPreservedGoogleAIParts(previous.parts) &&
            !hasPreservedGoogleAIParts(content.parts)
        ) {
            previous.parts = mergeGoogleAIParts(previous.parts, content.parts);
            continue;
        }

        merged.push({
            role,
            parts: content.parts,
        });
    }

    return merged;
}

function replayGoogleAIParts(message: ChatGenerationMessage): GoogleAIPart[] | undefined {
    if (message.role !== ChatGenerationMessageRole.Assistant) {
        return undefined;
    }

    const googleAI = googleAIReasoningDetails(message.reasoningDetails);

    if (!googleAI?.parts?.length) {
        return undefined;
    }

    const parts = googleAI.parts;
    const visibleText = googleAI.visibleText ?? visibleTextForParts(parts).trim();

    if (visibleText !== messageContentToText(message.content).trim()) {
        return undefined;
    }

    return parts;
}

function googleAIReasoningDetails(value: unknown) {
    if (!isRecord(value) || !isRecord(value.googleAI)) {
        return undefined;
    }

    const parts = Array.isArray(value.googleAI.parts)
        ? value.googleAI.parts.filter(isGoogleAIPart)
        : undefined;
    const visibleText =
        typeof value.googleAI.visibleText === "string"
            ? value.googleAI.visibleText
            : undefined;

    return {
        ...(parts ? { parts } : {}),
        ...(visibleText !== undefined ? { visibleText } : {}),
    };
}

function visibleTextForParts(parts: GoogleAIPart[]) {
    return parts
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");
}

function generationMessageContentToGoogleAIParts(
    content: ChatGenerationMessage["content"],
): GoogleAIPart[] {
    if (typeof content === "string") {
        return [{ text: content }];
    }

    return content.map((part) => {
        if (part.type === "text") {
            return { text: part.text };
        }

        if (part.type === "file") {
            if (!part.file.url || !part.file.mime_type) {
                throw new Error(
                    "Google AI file input must be uploaded before generation.",
                );
            }

            return {
                fileData: {
                    fileUri: part.file.url,
                    mimeType: part.file.mime_type,
                },
            };
        }

        const image = parseDataImageUrl(part.image_url.url);

        if (!image) {
            throw new Error("Google AI image input must be a base64 data URL.");
        }

        return {
            inlineData: {
                mimeType: image.mimeType,
                data: image.data,
            },
        };
    });
}

function mergeGoogleAIParts(left: GoogleAIPart[], right: GoogleAIPart[]) {
    if (!left.length) {
        return right;
    }

    if (!right.length) {
        return left;
    }

    if (left.every(isTextOnlyPart) && right.every(isTextOnlyPart)) {
        return [
            {
                text: `${visibleTextForParts(left)}\n${visibleTextForParts(right)}`,
            },
        ];
    }

    return [...left, { text: "\n" }, ...right];
}

function hasVisiblePart(part: GoogleAIPart) {
    return Boolean(
        part.text?.trim() ||
        part.inlineData ||
        part.fileData ||
        part.functionCall ||
        part.functionResponse,
    );
}

function isTextOnlyPart(part: GoogleAIPart) {
    return (
        typeof part.text === "string" &&
        !part.inlineData &&
        !part.thought &&
        !hasThoughtSignature(part)
    );
}

function hasPreservedGoogleAIParts(parts: GoogleAIPart[]) {
    return parts.some((part) => part.thought || hasThoughtSignature(part));
}

function hasThoughtSignature(part: GoogleAIPart) {
    return Boolean(part.thoughtSignature || part.thought_signature);
}

function isGoogleAIPart(value: unknown): value is GoogleAIPart {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.text === "string" ||
        isGoogleAIInlineData(value.inlineData) ||
        isGoogleAIFileData(value.fileData) ||
        isGoogleAIFunctionCall(value.functionCall) ||
        isGoogleAIFunctionResponse(value.functionResponse) ||
        typeof value.thought === "boolean" ||
        typeof value.thoughtSignature === "string" ||
        typeof value.thought_signature === "string"
    );
}

function isGoogleAIFileData(value: unknown) {
    return (
        isRecord(value) &&
        typeof value.fileUri === "string" &&
        typeof value.mimeType === "string"
    );
}

function isGoogleAIInlineData(value: unknown) {
    return (
        isRecord(value) &&
        typeof value.mimeType === "string" &&
        typeof value.data === "string"
    );
}

function isGoogleAIFunctionCall(value: unknown) {
    return isRecord(value) && typeof value.name === "string";
}

function isGoogleAIFunctionResponse(value: unknown) {
    return isRecord(value) && typeof value.name === "string" && isRecord(value.response);
}

function extractGoogleAIToolCalls(response: GoogleAIGenerateContentResponse): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        const call = part.functionCall;
        const name = call?.name?.trim();

        if (!call || !name) {
            continue;
        }

        const args = call.args ?? {};

        toolCalls.push({
            id: call.id || `tool-call-${toolCalls.length + 1}`,
            name,
            argumentsText: JSON.stringify(args),
            arguments: args,
            providerState: part,
        });
    }

    return toolCalls;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
