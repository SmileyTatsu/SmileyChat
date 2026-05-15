import { getMessageContent } from "#frontend/lib/messages";
import type { Message } from "#frontend/types";

import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "../types";
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
    const systemText = messages
        .filter((message) => message.role === "developer" || message.role === "system")
        .map((message) => message.content.trim())
        .filter(Boolean)
        .join("\n\n");
    const contents = mergeConsecutiveContents(
        messages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map(toGoogleAIContent)
            .filter((content) => content.parts.some((part) => part.text?.trim())),
    );
    const thinkingConfig = cleanThinkingConfig(config.thinking);

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
        ...(thinkingConfig
            ? {
                  generationConfig: {
                      thinkingConfig,
                  },
              }
            : {}),
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
    const reasoning = extractGoogleAIThoughtText(response).trim();
    const reasoningDetails = createGoogleAIReasoningDetails(response, message);

    if (!message) {
        const reason = candidate?.finishMessage || candidate?.finishReason;
        throw new Error(
            reason
                ? `Google AI response did not include message content: ${reason}`
                : "Google AI response did not include message content.",
        );
    }

    return {
        message,
        provider: "google-ai",
        model: response.modelVersion,
        ...(reasoning ? { reasoning } : {}),
        ...(reasoningDetails ? { reasoningDetails } : {}),
        raw: response,
    };
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
    const replayParts = replayGoogleAIParts(message);

    if (replayParts) {
        return {
            role: "model",
            parts: replayParts,
        };
    }

    return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
    };
}

function mergeConsecutiveContents(contents: GoogleAIContent[]) {
    const merged: GoogleAIContent[] = [];

    for (const content of contents) {
        const role = content.role as GoogleAIRole | undefined;
        const text = visibleTextForParts(content.parts).trim();

        if (!role || !text) {
            continue;
        }

        const previous = merged[merged.length - 1];

        if (
            previous?.role === role &&
            !hasPreservedGoogleAIParts(previous.parts) &&
            !hasPreservedGoogleAIParts(content.parts)
        ) {
            previous.parts = [
                {
                    text: `${visibleTextForParts(previous.parts)}\n${text}`,
                },
            ];
            continue;
        }

        merged.push({
            role,
            parts: hasPreservedGoogleAIParts(content.parts) ? content.parts : [{ text }],
        });
    }

    return merged;
}

function replayGoogleAIParts(message: ChatGenerationMessage): GoogleAIPart[] | undefined {
    if (message.role !== "assistant") {
        return undefined;
    }

    const googleAI = googleAIReasoningDetails(message.reasoningDetails);

    if (!googleAI?.parts?.length) {
        return undefined;
    }

    const parts = googleAI.parts;
    const visibleText = googleAI.visibleText ?? visibleTextForParts(parts).trim();

    if (visibleText !== message.content.trim()) {
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
        typeof value.thought === "boolean" ||
        typeof value.thoughtSignature === "string" ||
        typeof value.thought_signature === "string"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
