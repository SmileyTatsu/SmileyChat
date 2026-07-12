import { localApiFetch } from "../api/client";

import type {
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "./types";

export function createServerGenerationConnection(profileId?: string): ConnectionAdapter {
    return {
        id: "smileychat-server",
        label: "SmileyChat server connection",
        buildPayload() {
            throw new Error(
                "Provider payload inspection is only available on this device.",
            );
        },
        async generate(request) {
            const response = await localApiFetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    profileId,
                    generation: request.generation,
                    promptMessages: request.promptMessages ?? [],
                    stream: request.stream === true,
                    tools: request.tools,
                }),
                signal: request.signal,
            });

            if (!response.ok || !response.body) {
                throw new Error(
                    `Server generation failed: ${response.status} ${await response.text()}`,
                );
            }

            if (request.stream !== true) {
                return readServerGenerationResult(response);
            }

            return readServerGenerationStream(response, request);
        },
    };
}

export async function readServerGenerationStream(
    response: Response,
    request: ChatGenerationRequest,
): Promise<ChatGenerationResult> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedEvents = 0;
    let message = "";
    let reasoning = "";
    const images: string[] = [];
    const consumeEvent = (event: ServerEvent) => {
        receivedEvents += 1;
        if (event.type === "token") {
            message += event.data.token;
            request.onToken?.(event.data.token);
        }
        if (event.type === "reasoning") {
            reasoning += event.data.token;
            request.onReasoningToken?.(event.data.token);
        }
        if (event.type === "image") {
            images.push(event.data.url);
            request.onImage?.(event.data.url);
        }
        if (event.type === "error") throw new Error(event.data.message);
        if (event.type === "done") return event.data;
    };

    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        let match = eventBoundary.exec(buffer);
        while (match) {
            const event = parseServerEvent(buffer.slice(0, match.index));
            buffer = buffer.slice(match.index + match[0].length);
            eventBoundary.lastIndex = 0;
            match = eventBoundary.exec(buffer);

            if (!event) continue;
            const result = consumeEvent(event);
            if (result) return result;
        }

        if (done) {
            // Be tolerant of intermediaries that pass through the terminal
            // SSE event but omit its final blank-line delimiter.
            const event = parseServerEvent(buffer);
            if (event) {
                const result = consumeEvent(event);
                if (result) return result;
            }
            break;
        }
    }

    if (message || reasoning || images.length) {
        return {
            message,
            ...(images.length ? { images } : {}),
            provider: "smileychat-server",
            ...(reasoning ? { reasoning } : {}),
        };
    }

    throw new Error(
        `Server generation ended without a result (${receivedEvents ? `${receivedEvents} SSE event(s) received` : "no SSE events received"}).`,
    );
}

export async function readServerGenerationResult(
    response: Response,
): Promise<ChatGenerationResult> {
    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        throw new Error("Server generation returned invalid JSON.");
    }

    if (!isChatGenerationResult(payload)) {
        const error =
            payload && typeof payload === "object" && "error" in payload
                ? (payload as { error?: unknown }).error
                : undefined;
        throw new Error(
            typeof error === "string" ? error : "Server generation returned an invalid result.",
        );
    }

    return payload.result;
}

function isChatGenerationResult(
    value: unknown,
): value is { result: ChatGenerationResult } {
    return Boolean(
        value &&
            typeof value === "object" &&
            "result" in value &&
            (value as { result?: unknown }).result &&
            typeof (value as { result?: unknown }).result === "object" &&
            typeof ((value as { result: ChatGenerationResult }).result.message) === "string" &&
            typeof ((value as { result: ChatGenerationResult }).result.provider) === "string",
    );
}

type ServerEvent =
    | { type: "token" | "reasoning"; data: { token: string } }
    | { type: "image"; data: { url: string } }
    | { type: "error"; data: { message: string } }
    | { type: "done"; data: ChatGenerationResult };

function parseServerEvent(value: string): ServerEvent | undefined {
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of value.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
            event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
        }
    }

    const data = dataLines.join("\n");
    if (!event || !data) return undefined;

    try {
        return { type: event, data: JSON.parse(data) } as ServerEvent;
    } catch {
        return undefined;
    }
}

const eventBoundary = /\r?\n\r?\n/;
