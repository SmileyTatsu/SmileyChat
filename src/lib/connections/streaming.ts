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
        };
        finish_reason?: string | null;
    }>;
};

export async function readChatCompletionStream(
    response: Response,
    onChunk: (chunk: ChatCompletionStreamChunk) => void,
) {
    if (!response.body) {
        throw new Error("Streaming response did not include a readable body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();

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

        buffer += decoder.decode();

        if (buffer.trim()) {
            parseServerSentEvent(buffer, onChunk);
        }
    } finally {
        reader.releaseLock();
    }
}

function parseServerSentEvent(
    event: string,
    onChunk: (chunk: ChatCompletionStreamChunk) => void,
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

    const chunk = JSON.parse(data) as ChatCompletionStreamChunk;
    onChunk(chunk);
}
