export type ChatCompletionStreamChunk = {
    model?: string;
    error?: {
        code?: number | string;
        message?: string;
        metadata?: Record<string, unknown>;
    };
    choices?: Array<{
        delta?: {
            content?: string | null;
            images?: Array<{
                type?: string;
                image_url?: {
                    url?: string;
                };
            }>;
            reasoning?: string | null;
            reasoning_details?: unknown;
        };
        finish_reason?: string | null;
    }>;
};

export async function readChatCompletionStream(
    response: Response,
    onChunk: (chunk: ChatCompletionStreamChunk) => void,
    signal?: AbortSignal,
) {
    await readJsonServerSentEvents<ChatCompletionStreamChunk>(
        response,
        onChunk,
        signal,
    );
}

export async function readJsonServerSentEvents<TChunk>(
    response: Response,
    onChunk: (chunk: TChunk) => void,
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
                parseServerSentEvent(event, onChunk);
            }
        }

        if (signal?.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
            parseServerSentEvent(buffer, onChunk);
        }
    } finally {
        signal?.removeEventListener("abort", abortReader);
        reader.releaseLock();
    }
}

function parseServerSentEvent<TChunk>(
    event: string,
    onChunk: (chunk: TChunk) => void,
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

    const chunk = JSON.parse(data) as TChunk;
    onChunk(chunk);
}
