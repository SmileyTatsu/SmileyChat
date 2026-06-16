import { consumeChatCompletionStream } from "../chat-completions";
import { safeResponseText, trimTrailingSlash } from "../http";
import type { ConnectionAdapter } from "../types";

import { defaultNovelAIBaseUrlForModel } from "./constants";
import { createNovelAIBody, normalizeNovelAICompletion } from "./mappers";
import type { NovelAICompletionResponse, NovelAIRuntimeConfig } from "./types";

export function createNovelAIConnection(config: NovelAIRuntimeConfig): ConnectionAdapter {
    return {
        id: "novelai",
        label: "NovelAI",
        buildPayload(request) {
            return createNovelAIBody(request, config);
        },
        async generate(request) {
            const body = createNovelAIBody(request, config);
            const targetUrl = createNovelAICompletionUrl(config);
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: createNovelAIHeaders(config),
                body: JSON.stringify(body),
                signal: request.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `NovelAI request failed at ${targetUrl}: ${response.status} ${await safeResponseText(response)}`,
                );
            }

            if (body.stream) {
                return consumeChatCompletionStream(response, request, {
                    provider: "novelai",
                    streamErrorPrefix: "NovelAI stream failed",
                    emptyMessage: "NovelAI stream did not include message content.",
                });
            }

            const data = (await response.json()) as NovelAICompletionResponse;
            return normalizeNovelAICompletion(data, config.model.id);
        },
    };
}

export function createNovelAICompletionUrl(config: NovelAIRuntimeConfig) {
    const baseUrl =
        config.baseUrl?.trim() || defaultNovelAIBaseUrlForModel(config.model.id);

    return `${trimTrailingSlash(baseUrl)}/oa/v1/chat/completions`;
}

function createNovelAIHeaders(config: Pick<NovelAIRuntimeConfig, "apiKey">) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (config.apiKey?.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }

    return headers;
}
