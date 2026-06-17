import { consumeChatCompletionStream } from "../chat-completions";
import { safeResponseText, trimTrailingSlash } from "../http";
import { readJsonServerSentEvents } from "../streaming";
import type {
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../types";

import { defaultNovelAIBaseUrlForModel, usesNovelAITextGenerationApi } from "./constants";
import {
    createNovelAIBody,
    createNovelAITextGenerationBody,
    normalizeNovelAICompletion,
    normalizeNovelAITextGenerationCompletion,
} from "./mappers";
import type {
    NovelAICompletionResponse,
    NovelAITextGenerationResponse,
    NovelAITextGenerationStreamChunk,
    NovelAIRuntimeConfig,
} from "./types";

export function createNovelAIConnection(config: NovelAIRuntimeConfig): ConnectionAdapter {
    return {
        id: "novelai",
        label: "NovelAI",
        buildPayload(request) {
            if (usesNovelAITextGenerationApi(config.model.id)) {
                return createNovelAITextGenerationBody(request, config);
            }

            return createNovelAIBody(request, config);
        },
        async generate(request) {
            if (usesNovelAITextGenerationApi(config.model.id)) {
                return generateNovelAITextCompletion(request, config);
            }

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

async function generateNovelAITextCompletion(
    request: ChatGenerationRequest,
    config: NovelAIRuntimeConfig,
) {
    const body = createNovelAITextGenerationBody(request, config);
    const targetUrl = createNovelAITextGenerationUrl(config, request.stream === true);
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

    if (request.stream) {
        return consumeNovelAITextGenerationStream(response, request, config.model.id);
    }

    const data = (await response.json()) as NovelAITextGenerationResponse;
    return normalizeNovelAITextGenerationCompletion(data, config.model.id);
}

async function consumeNovelAITextGenerationStream(
    response: Response,
    request: ChatGenerationRequest,
    model: string,
): Promise<ChatGenerationResult> {
    let message = "";

    await readJsonServerSentEvents<NovelAITextGenerationStreamChunk>(
        response,
        (chunk) => {
            const error =
                typeof chunk.error === "string" ? chunk.error : chunk.error?.message;

            if (error) {
                throw new Error(`NovelAI stream failed: ${error}`);
            }

            const token = chunk.token ?? chunk.output;
            if (token) {
                message += token;
                request.onToken?.(token);
            }
        },
        request.signal,
    );

    if (!message.trim()) {
        throw new Error("NovelAI stream did not include message content.");
    }

    return {
        message: message.trim(),
        provider: "novelai",
        model,
    };
}

export function createNovelAICompletionUrl(config: NovelAIRuntimeConfig) {
    const baseUrl =
        config.baseUrl?.trim() || defaultNovelAIBaseUrlForModel(config.model.id);

    return `${trimTrailingSlash(baseUrl)}/oa/v1/chat/completions`;
}

export function createNovelAITextGenerationUrl(
    config: NovelAIRuntimeConfig,
    stream: boolean,
) {
    const baseUrl =
        config.baseUrl?.trim() || defaultNovelAIBaseUrlForModel(config.model.id);

    return `${trimTrailingSlash(baseUrl)}/ai/generate${stream ? "-stream" : ""}`;
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
