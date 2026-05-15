import { safeResponseText } from "../http";
import { readChatCompletionStream } from "../streaming";
import type { ConnectionAdapter } from "../types";
import {
    createOpenRouterChatCompletionBody,
    normalizeOpenRouterChatCompletion,
} from "./mappers";
import type {
    OpenRouterChatCompletionResponse,
    OpenRouterErrorResponse,
    OpenRouterRuntimeConfig,
} from "./types";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const appReferer = "https://github.com/ScyllaTatsu/ScyllaChat";
const appTitle = "ScyllaChat";
const appCategories = "roleplay,creative-writing,general-chat";

export function createOpenRouterConnection(
    config: OpenRouterRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "openrouter",
        label: "OpenRouter",
        async generate(request) {
            const body = createOpenRouterChatCompletionBody(request, config);
            const targetUrl = `${openRouterBaseUrl}/chat/completions`;
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: createOpenRouterHeaders(config),
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(
                    `OpenRouter request failed: ${response.status} ${await openRouterErrorText(response)}`,
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
                            `OpenRouter stream failed: ${chunk.error.message}`,
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
                });

                if (!message.trim()) {
                    throw new Error("OpenRouter stream did not include message content.");
                }

                return {
                    message: message.trim(),
                    provider: "openrouter",
                    model,
                    ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
                    ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
                };
            }

            const data = (await response.json()) as OpenRouterChatCompletionResponse;
            return normalizeOpenRouterChatCompletion(data);
        },
    };
}

export function createOpenRouterHeaders(config: OpenRouterRuntimeConfig) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "HTTP-Referer": appReferer,
        "X-OpenRouter-Categories": appCategories,
        "X-OpenRouter-Title": appTitle,
    };

    if (config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }

    return headers;
}

async function openRouterErrorText(response: Response) {
    const text = await safeResponseText(response);

    if (!text) {
        return "";
    }

    try {
        const data = JSON.parse(text) as OpenRouterErrorResponse;
        return data.error?.message ?? text;
    } catch {
        return text;
    }
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
