import { safeResponseText } from "../http";
import { consumeChatCompletionStream } from "../chat-completions";
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
const appReferer = "https://github.com/SmileyTatsu/SmileyChat";
const appTitle = "SmileyChat";
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
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `OpenRouter request failed: ${response.status} ${await openRouterErrorText(response)}`,
                );
            }

            if (body.stream) {
                return consumeChatCompletionStream(response, request, {
                    allowImages: true,
                    provider: "openrouter",
                    streamErrorPrefix: "OpenRouter stream failed",
                    emptyMessage:
                        "OpenRouter stream did not include message content.",
                });
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
