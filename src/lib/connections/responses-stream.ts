import { readJsonServerSentEvents } from "./streaming";
import type { ChatGenerationRequest, ChatGenerationResult } from "./types";

export async function consumeResponsesApiStream(
    response: Response,
    request: ChatGenerationRequest,
    options: {
        emptyMessage: string;
        provider: string;
    },
): Promise<ChatGenerationResult> {
    let message = "";
    let model: string | undefined;
    let reasoning = "";

    await readJsonServerSentEvents<Record<string, unknown>>(
        response,
        (chunk) => {
            model = extractResponsesModel(chunk) ?? model;
            const reasoningDelta = extractResponsesReasoningDelta(chunk);
            const delta = extractResponsesTextDelta(chunk);

            if (reasoningDelta) {
                reasoning += reasoningDelta;
                request.onReasoningToken?.(reasoningDelta);
            }

            if (delta) {
                message += delta;
                request.onToken?.(delta);
            }
        },
        request.signal,
    );

    if (!message.trim()) {
        throw new Error(options.emptyMessage);
    }

    return {
        message: message.trim(),
        provider: options.provider,
        model,
        ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
    };
}

function extractResponsesModel(chunk: Record<string, unknown>) {
    if (typeof chunk.model === "string") {
        return chunk.model;
    }

    if (isRecord(chunk.response) && typeof chunk.response.model === "string") {
        return chunk.response.model;
    }

    return undefined;
}

function extractResponsesTextDelta(chunk: Record<string, unknown>) {
    const type = typeof chunk.type === "string" ? chunk.type : "";

    if (isResponsesReasoningEvent(chunk)) {
        return "";
    }

    if (
        type === "response.output_text.delta" ||
        type === "response.refusal.delta" ||
        type.endsWith(".output_text.delta")
    ) {
        return typeof chunk.delta === "string" ? chunk.delta : "";
    }

    if (typeof chunk.delta === "string") {
        return chunk.delta;
    }

    if (isRecord(chunk.delta) && typeof chunk.delta.text === "string") {
        return chunk.delta.text;
    }

    if (typeof chunk.text === "string") {
        return chunk.text;
    }

    if (isRecord(chunk.part) && typeof chunk.part.text === "string") {
        return chunk.part.text;
    }

    return "";
}

function extractResponsesReasoningDelta(chunk: Record<string, unknown>) {
    const type = typeof chunk.type === "string" ? chunk.type : "";

    if (
        type === "response.reasoning_text.delta" ||
        type === "response.reasoning_summary_text.delta"
    ) {
        return typeof chunk.delta === "string" ? chunk.delta : "";
    }

    if (
        isRecord(chunk.part) &&
        (chunk.part.type === "summary_text" || chunk.part.type === "reasoning_text") &&
        typeof chunk.part.text === "string"
    ) {
        return chunk.part.text;
    }

    return "";
}

function isResponsesReasoningEvent(chunk: Record<string, unknown>) {
    const type = typeof chunk.type === "string" ? chunk.type : "";

    return (
        type === "response.reasoning_text.delta" ||
        type === "response.reasoning_summary_text.delta" ||
        (isRecord(chunk.part) &&
            (chunk.part.type === "summary_text" || chunk.part.type === "reasoning_text"))
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
