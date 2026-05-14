import type { ConnectionAdapter } from "../types";
import { safeResponseText, trimTrailingSlash } from "../http";
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
            });

            if (!response.ok) {
                throw new Error(
                    `OpenAI-compatible request failed at ${targetUrl}: ${response.status} ${await safeResponseText(response)}`,
                );
            }

            const data =
                (await response.json()) as OpenAICompatibleChatCompletionResponse;
            return normalizeChatCompletion(data);
        },
    };
}
