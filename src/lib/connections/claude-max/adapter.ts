import { localApiFetch } from "#frontend/lib/api/client";

import {
    createChatCompletionMessages,
} from "../chat-completions";
import { readChatCompletionStream } from "../streaming";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../types";

import type { ClaudeMaxRuntimeConfig } from "./types";

export function createClaudeMaxConnection(
    config: ClaudeMaxRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "claude-max",
        label: "Claude Max",
        async generate(request) {
            if (!config.model.id.trim()) {
                throw new Error("Claude Max needs a model.");
            }

            const messages = createChatCompletionMessages(request, {
                includeReasoningHistory: false,
                mapPromptRole: (role) => (role === "developer" ? "system" : role),
                mapHistoryRole: (message) =>
                    message.role === "user" ? "user" : "assistant",
            });

            const { systemPrompt, conversation } = splitSystemPrompt(messages);
            const stream = request.stream === true;

            const response = await localApiFetch("/api/claude-max/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: stream ? "text/event-stream" : "application/json",
                },
                body: JSON.stringify({
                    model: config.model.id,
                    thinking: config.thinking,
                    maxOutputTokens: config.maxOutputTokens,
                    systemPrompt,
                    messages: conversation,
                    stream,
                }),
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `Claude Max request failed: ${response.status}${await readErrorSuffix(response)}`,
                );
            }

            if (stream) {
                return consumeServerStream(response, request);
            }

            return readNonStreamingResponse(response, config.model.id);
        },
    };
}

function splitSystemPrompt(messages: ReturnType<typeof createChatCompletionMessages>) {
    const systemParts: string[] = [];
    const conversation: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const message of messages) {
        if (message.role === "system") {
            const text = stringifyContent(message.content);
            if (text) {
                systemParts.push(text);
            }
            continue;
        }

        const role = message.role === "user" ? "user" : "assistant";
        const content = stringifyContent(message.content);

        if (content) {
            conversation.push({ role, content });
        }
    }

    return {
        systemPrompt: systemParts.join("\n\n").trim() || undefined,
        conversation,
    };
}

function stringifyContent(content: ChatGenerationMessage["content"]): string {
    if (typeof content === "string") {
        return content;
    }

    return content
        .map((part) => (part.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("");
}

async function consumeServerStream(
    response: Response,
    request: ChatGenerationRequest,
): Promise<ChatGenerationResult> {
    let message = "";
    let model: string | undefined;
    let reasoning = "";

    await readChatCompletionStream(
        response,
        (chunk) => {
            if (chunk.error?.message) {
                throw new Error(`Claude Max stream failed: ${chunk.error.message}`);
            }

            model = chunk.model ?? model;

            const reasoningToken = chunk.choices?.[0]?.delta?.reasoning;
            const token = chunk.choices?.[0]?.delta?.content;

            if (reasoningToken) {
                reasoning += reasoningToken;
                request.onReasoningToken?.(reasoningToken);
            }

            if (token) {
                message += token;
                request.onToken?.(token);
            }
        },
        request.signal,
    );

    if (!message.trim()) {
        throw new Error("Claude Max stream did not include message content.");
    }

    return {
        message: message.trim(),
        provider: "claude-max",
        model,
        ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
    };
}

async function readNonStreamingResponse(
    response: Response,
    modelId: string,
): Promise<ChatGenerationResult> {
    const body = (await response.json()) as {
        message?: unknown;
        reasoning?: unknown;
        model?: unknown;
    };

    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
        throw new Error("Claude Max response did not include message content.");
    }

    const reasoning =
        typeof body.reasoning === "string" && body.reasoning.trim()
            ? body.reasoning.trim()
            : undefined;
    const model =
        typeof body.model === "string" && body.model.trim() ? body.model : modelId;

    return {
        message,
        provider: "claude-max",
        model,
        ...(reasoning ? { reasoning } : {}),
    };
}

export async function readClaudeMaxStatus(): Promise<{
    ok: boolean;
    version?: string;
    error?: string;
}> {
    const response = await localApiFetch("/api/claude-max/status");
    const body = (await response.json().catch(() => null)) as {
        ok?: unknown;
        version?: unknown;
        error?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
        return {
            ok: false,
            error: `Claude Max status check failed: ${response.status}.`,
        };
    }

    return {
        ok: body.ok === true,
        version: typeof body.version === "string" ? body.version : undefined,
        error: typeof body.error === "string" ? body.error : undefined,
    };
}

async function readErrorSuffix(response: Response) {
    try {
        const text = await response.text();

        if (!text.trim()) {
            return "";
        }

        try {
            const parsed = JSON.parse(text) as {
                error?: unknown;
                message?: unknown;
            };
            const message =
                (typeof parsed.error === "string" && parsed.error) ||
                (typeof parsed.message === "string" && parsed.message);

            if (message) {
                return ` - ${message}`;
            }
        } catch {
            return ` - ${text.slice(0, 500)}`;
        }

        return ` - ${text.slice(0, 500)}`;
    } catch {
        return "";
    }
}
