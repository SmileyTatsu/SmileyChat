import {
    extractGoogleAIImages,
    extractGoogleAIText,
    extractGoogleAIThoughtText,
} from "./mappers";
import type { GoogleAIGenerateContentStreamChunk } from "./types";

export async function readGoogleAIStream(
    response: Response,
    onChunk: (
        tokens: {
            images: string[];
            message: string;
            reasoning: string;
        },
        chunk: GoogleAIGenerateContentStreamChunk,
    ) => void,
    signal?: AbortSignal,
) {
    if (!response.body) {
        throw new Error("Streaming response did not include a readable body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const abortReader = () => {
        void reader.cancel();
    };

    try {
        if (signal?.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
        }

        signal?.addEventListener("abort", abortReader, { once: true });

        while (true) {
            const { done, value } = await reader.read();

            if (signal?.aborted) {
                throw new DOMException("The operation was aborted.", "AbortError");
            }

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";

            for (const event of events) {
                parseGoogleAIEvent(event, onChunk);
            }
        }

        if (signal?.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
            parseGoogleAIEvent(buffer, onChunk);
        }
    } finally {
        signal?.removeEventListener("abort", abortReader);
        reader.releaseLock();
    }
}

function parseGoogleAIEvent(
    event: string,
    onChunk: (
        tokens: {
            images: string[];
            message: string;
            reasoning: string;
        },
        chunk: GoogleAIGenerateContentStreamChunk,
    ) => void,
) {
    const dataLines = event
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
        return;
    }

    const data = dataLines.join("\n").trim();

    if (!data || data === "[DONE]") {
        return;
    }

    const chunk = JSON.parse(data) as GoogleAIGenerateContentStreamChunk;
    const images = extractGoogleAIImages(chunk);
    const message = extractGoogleAIText(chunk);
    const reasoning = extractGoogleAIThoughtText(chunk);

    if (message || reasoning || images.length) {
        onChunk({ images, message, reasoning }, chunk);
    }
}
