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

    await readJsonServerSentEvents<Record<string, unknown>>(
        response,
        (chunk) => {
            model = extractResponsesModel(chunk) ?? model;
            const delta = extractResponsesTextDelta(chunk);

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

    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
