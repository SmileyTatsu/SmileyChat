import { consumeChatCompletionStream } from "../chat-completions";
import { filePartToBlob, hasFileContent } from "../images";
import { safeResponseText, trimTrailingSlash } from "../http";
import { readJsonServerSentEvents } from "../streaming";
import type {
    ChatGenerationMessage,
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
            if (request.tools?.length) {
                console.warn(
                    "NovelAI does not support native tool calling. Registered tools were ignored for this request.",
                );
            }

            const preparedRequest = hasFileContent(request.promptMessages ?? [])
                ? await inlineNovelAITextFiles(request)
                : request;

            if (usesNovelAITextGenerationApi(config.model.id)) {
                return generateNovelAITextCompletion(preparedRequest, config);
            }

            const body = createNovelAIBody(preparedRequest, config);
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
                return consumeChatCompletionStream(response, preparedRequest, {
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

async function inlineNovelAITextFiles(
    request: ChatGenerationRequest,
): Promise<ChatGenerationRequest> {
    if (!request.promptMessages?.length) {
        return request;
    }

    return {
        ...request,
        promptMessages: await Promise.all(
            request.promptMessages.map(async (message) => {
                if (typeof message.content === "string") {
                    return message;
                }

                const content: ChatGenerationMessage["content"] = [];

                for (const part of message.content) {
                    if (part.type !== "file") {
                        content.push(part);
                        continue;
                    }

                    content.push({
                        type: "text",
                        text: await novelAITextForFile(part.file),
                    });
                }

                return { ...message, content };
            }),
        ),
    };
}

async function novelAITextForFile(file: {
    file_data?: string;
    filename?: string;
    mime_type?: string;
    url?: string;
}) {
    const mimeType = file.mime_type ?? "";
    const isTextLike =
        mimeType.startsWith("text/") ||
        [
            "application/json",
            "application/ld+json",
            "application/xml",
            "application/x-yaml",
        ].includes(mimeType);

    if (!isTextLike) {
        throw new Error(
            "NovelAI file understanding is not supported for this file type. Use a small text, Markdown, JSON, CSV, or code file.",
        );
    }

    const blob = await filePartToBlob(file);
    const maxInlineBytes = 256 * 1024;

    if (blob.size > maxInlineBytes) {
        throw new Error(
            "NovelAI file understanding only supports text files up to 256 KB.",
        );
    }

    const text = await blob.text();
    return [
        "",
        `Attached file: ${file.filename ?? "attachment"}`,
        "```",
        text,
        "```",
    ].join("\n");
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
