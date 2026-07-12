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

            return readGenerationStream(response, request);
        },
    };
}

async function readGenerationStream(
    response: Response,
    request: ChatGenerationRequest,
): Promise<ChatGenerationResult> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
            const event = parseServerEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            if (!event) continue;
            if (event.type === "token") request.onToken?.(event.data.token);
            if (event.type === "reasoning") request.onReasoningToken?.(event.data.token);
            if (event.type === "image") request.onImage?.(event.data.url);
            if (event.type === "error") throw new Error(event.data.message);
            if (event.type === "done") return event.data;
        }

        if (done) break;
    }

    throw new Error("Server generation ended without a result.");
}

type ServerEvent =
    | { type: "token" | "reasoning"; data: { token: string } }
    | { type: "image"; data: { url: string } }
    | { type: "error"; data: { message: string } }
    | { type: "done"; data: ChatGenerationResult };

function parseServerEvent(value: string): ServerEvent | undefined {
    const event = value.match(/^event: ([^\n]+)$/m)?.[1];
    const data = value.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) return undefined;

    try {
        return { type: event, data: JSON.parse(data) } as ServerEvent;
    } catch {
        return undefined;
    }
}
