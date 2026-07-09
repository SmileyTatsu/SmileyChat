import { consumeChatCompletionStream } from "../chat-completions";
import { safeResponseText, trimTrailingSlash } from "../http";
import type { ConnectionAdapter } from "../types";

import { createXAIChatCompletionBody, normalizeXAIChatCompletion } from "./mappers";
import type {
    XAIChatCompletionResponse,
    XAIErrorResponse,
    XAIRuntimeConfig,
} from "./types";

export function createXAIConnection(config: XAIRuntimeConfig): ConnectionAdapter {
    return {
        id: "xai",
        label: "xAI",
        buildPayload(request) {
            return createXAIChatCompletionBody(request, config);
        },
        async generate(request) {
            const body = createXAIChatCompletionBody(request, config);
            const targetUrl = createXAIChatCompletionsUrl(config);
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: createXAIHeaders(config),
                body: JSON.stringify(body),
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `xAI request failed at ${targetUrl}: ${response.status} ${await xaiErrorText(response)}`,
                );
            }

            if (body.stream) {
                return consumeChatCompletionStream(response, request, {
                    provider: "xai",
                    streamErrorPrefix: "xAI stream failed",
                    emptyMessage: "xAI stream did not include message content.",
                });
            }

            const data = (await response.json()) as XAIChatCompletionResponse;
            return normalizeXAIChatCompletion(data);
        },
    };
}

export function createXAIChatCompletionsUrl(config: Pick<XAIRuntimeConfig, "baseUrl">) {
    return `${trimTrailingSlash(config.baseUrl)}/chat/completions`;
}

export function createXAIHeaders(config: Pick<XAIRuntimeConfig, "apiKey">) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }

    return headers;
}

async function xaiErrorText(response: Response) {
    const text = await safeResponseText(response);

    if (!text) {
        return "";
    }

    try {
        const data = JSON.parse(text) as XAIErrorResponse;
        return data.error?.message ?? text;
    } catch {
        return text;
    }
}
