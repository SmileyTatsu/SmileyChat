import { safeResponseText, trimTrailingSlash } from "../http";
import { readChatCompletionStream } from "../streaming";
import type { ConnectionAdapter } from "../types";

import { createChatCompletionBody, normalizeChatCompletion } from "./mappers";
import type {
    OpenAICompatibleChatCompletionResponse,
    OpenAICompatibleRuntimeConfig,
} from "./types";

export function createOpenAICompatibleConnection(
    config: OpenAICompatibleRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "openai-compatible",
        label: "OpenAI compatible",
        async generate(request) {
            const body = createChatCompletionBody(request, config);
            const targetUrl = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            if (config.apiKey?.trim()) {
                headers.Authorization = `Bearer ${config.apiKey.trim()}`;
            }

            const response = await fetch(targetUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `OpenAI-compatible request failed at ${targetUrl}: ${response.status} ${await safeResponseText(response)}`,
                );
            }

            if (body.stream) {
                let message = "";
                let model: string | undefined;
                let reasoning = "";
                let reasoningDetails: unknown;

                await readChatCompletionStream(response, (chunk) => {
                    if (chunk.error?.message) {
                        throw new Error(
                            `OpenAI-compatible stream failed: ${chunk.error.message}`,
                        );
                    }

                    model = chunk.model ?? model;

                    const token = chunk.choices?.[0]?.delta?.content;
                    const reasoningToken = chunk.choices?.[0]?.delta?.reasoning;
                    const nextReasoningDetails =
                        chunk.choices?.[0]?.delta?.reasoning_details;

                    if (reasoningToken) {
                        reasoning += reasoningToken;
                        request.onReasoningToken?.(reasoningToken);
                    }

                    if (nextReasoningDetails !== undefined) {
                        reasoningDetails = mergeReasoningDetails(
                            reasoningDetails,
                            nextReasoningDetails,
                        );
                    }

                    if (token) {
                        message += token;
                        request.onToken?.(token);
                    }
                }, request.signal);

                if (!message.trim()) {
                    throw new Error(
                        "OpenAI-compatible stream did not include message content.",
                    );
                }

                return {
                    message: message.trim(),
                    provider: "openai-compatible",
                    model,
                    ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
                    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                };
            }

            const data =
                (await response.json()) as OpenAICompatibleChatCompletionResponse;
            return normalizeChatCompletion(data);
        },
    };
}

function mergeReasoningDetails(current: unknown, next: unknown) {
    if (Array.isArray(current) && Array.isArray(next)) {
        return [...current, ...next];
    }

    if (Array.isArray(current)) {
        return [...current, next];
    }

    if (current !== undefined && Array.isArray(next)) {
        return [current, ...next];
    }

    if (current !== undefined) {
        return [current, next];
    }

    return next;
}
