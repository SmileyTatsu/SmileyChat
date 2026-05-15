import type { Message } from "../../../types";
import { getMessageContent } from "../../messages";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
} from "../types";
import type {
    GoogleAIContent,
    GoogleAIGenerateContentRequest,
    GoogleAIGenerateContentResponse,
    GoogleAIRuntimeConfig,
} from "./types";

type GoogleAIRole = "user" | "model";

export function createGoogleAIGenerateBody(
    request: ChatGenerationRequest,
    config: GoogleAIRuntimeConfig,
): GoogleAIGenerateContentRequest {
    void config;

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

    if (contents.length === 0) {
        throw new Error("Google AI request needs at least one user or assistant message.");
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
    };
}

export function normalizeGoogleAIResponse(
    response: GoogleAIGenerateContentResponse,
): ChatGenerationResult {
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Google AI prompt blocked: ${response.promptFeedback.blockReason}`);
    }

    const candidate = response.candidates?.[0];
    const message = extractGoogleAIText(response).trim();

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
        raw: response,
    };
}

export function extractGoogleAIText(response: GoogleAIGenerateContentResponse) {
    return (
        response.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("") ?? ""
    );
}

function toGoogleAIContent(message: ChatGenerationMessage): GoogleAIContent {
    return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
    };
}

function mergeConsecutiveContents(contents: GoogleAIContent[]) {
    const merged: GoogleAIContent[] = [];

    for (const content of contents) {
        const role = content.role as GoogleAIRole | undefined;
        const text = content.parts
            .map((part) => part.text ?? "")
            .join("")
            .trim();

        if (!role || !text) {
            continue;
        }

        const previous = merged[merged.length - 1];

        if (previous?.role === role) {
            previous.parts = [
                {
                    text: `${previous.parts.map((part) => part.text ?? "").join("")}\n${text}`,
                },
            ];
            continue;
        }

        merged.push({
            role,
            parts: [{ text }],
        });
    }

    return merged;
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
