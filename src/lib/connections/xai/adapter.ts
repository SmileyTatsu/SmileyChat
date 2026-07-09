import { consumeChatCompletionStream } from "../chat-completions";
import { filePartToBlob, hasFileContent, mapFileContentParts } from "../images";
import { safeResponseText, trimTrailingSlash } from "../http";
import { consumeResponsesApiStream } from "../responses-stream";
import type {
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../types";

import {
    createXAIChatCompletionBody,
    createXAIResponsesBody,
    normalizeXAIChatCompletion,
    normalizeXAIResponsesResponse,
} from "./mappers";
import type {
    XAIChatCompletionResponse,
    XAIErrorResponse,
    XAIResponsesResponse,
    XAIRuntimeConfig,
} from "./types";

export function createXAIConnection(config: XAIRuntimeConfig): ConnectionAdapter {
    return {
        id: "xai",
        label: "xAI",
        buildPayload(request) {
            if (hasFileContent(request.promptMessages ?? [])) {
                return createXAIResponsesBody(request, config);
            }

            return createXAIChatCompletionBody(request, config);
        },
        async generate(request) {
            if (hasFileContent(request.promptMessages ?? [])) {
                return generateXAIResponses(request, config);
            }

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

async function generateXAIResponses(
    request: ChatGenerationRequest,
    config: XAIRuntimeConfig,
): Promise<ChatGenerationResult> {
    const uploadedFileIds: string[] = [];

    try {
        const preparedRequest = await uploadXAIFiles(request, config, uploadedFileIds);
        const body = createXAIResponsesBody(preparedRequest, config);
        const targetUrl = `${trimTrailingSlash(config.baseUrl)}/responses`;
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
            return consumeResponsesApiStream(response, request, {
                emptyMessage: "xAI stream did not include message content.",
                provider: "xai",
            });
        }

        const data = (await response.json()) as XAIResponsesResponse;
        return normalizeXAIResponsesResponse(data);
    } finally {
        await deleteXAIFiles(config, uploadedFileIds);
    }
}

async function uploadXAIFiles(
    request: ChatGenerationRequest,
    config: XAIRuntimeConfig,
    uploadedFileIds: string[],
) {
    return mapFileContentParts(request, async (file) => {
        if (!file.file_data) {
            return file;
        }

        const blob = await filePartToBlob(file);
        const uploaded = await uploadXAIFile(config, blob, file.filename);
        uploadedFileIds.push(uploaded.id);

        return {
            filename: file.filename,
            mime_type: uploaded.mimeType || file.mime_type || blob.type,
            url: uploaded.id,
        };
    });
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

async function uploadXAIFile(
    config: XAIRuntimeConfig,
    blob: Blob,
    filename = "attachment",
) {
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("purpose", "assistants");

    const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/files`, {
        method: "POST",
        headers: createXAIUploadHeaders(config),
        body: formData,
    });

    if (!response.ok) {
        throw new Error(
            `xAI file upload failed: ${response.status} ${await xaiErrorText(response)}`,
        );
    }

    const data = (await response.json()) as {
        id?: string;
        mime_type?: string;
    };

    if (!data.id) {
        throw new Error("xAI file upload response was missing a file id.");
    }

    return {
        id: data.id,
        mimeType: data.mime_type,
    };
}

function createXAIUploadHeaders(config: Pick<XAIRuntimeConfig, "apiKey">) {
    const headers = createXAIHeaders(config);
    delete headers["Content-Type"];
    return headers;
}

async function deleteXAIFiles(config: XAIRuntimeConfig, fileIds: string[]) {
    await Promise.allSettled(
        fileIds.map((fileId) =>
            fetch(
                `${trimTrailingSlash(config.baseUrl)}/files/${encodeURIComponent(fileId)}`,
                {
                    method: "DELETE",
                    headers: createXAIHeaders(config),
                },
            ),
        ),
    );
}
