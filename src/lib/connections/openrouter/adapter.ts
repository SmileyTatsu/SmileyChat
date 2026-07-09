import { safeResponseText } from "../http";
import { consumeChatCompletionStream } from "../chat-completions";
import { filePartToBlob, hasFileContent, mapFileContentParts } from "../images";
import { consumeResponsesApiStream } from "../responses-stream";
import type {
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../types";
import {
    createOpenRouterChatCompletionBody,
    createOpenRouterResponsesBody,
    normalizeOpenRouterChatCompletion,
    normalizeOpenRouterResponsesResponse,
} from "./mappers";
import type {
    OpenRouterChatCompletionResponse,
    OpenRouterErrorResponse,
    OpenRouterResponsesResponse,
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
        buildPayload(request) {
            if (hasFileContent(request.promptMessages ?? [])) {
                return createOpenRouterResponsesBody(request, config);
            }

            return createOpenRouterChatCompletionBody(request, config);
        },
        async generate(request) {
            if (hasFileContent(request.promptMessages ?? [])) {
                return generateOpenRouterResponses(request, config);
            }

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
                    emptyMessage: "OpenRouter stream did not include message content.",
                });
            }

            const data = (await response.json()) as OpenRouterChatCompletionResponse;
            return normalizeOpenRouterChatCompletion(data);
        },
    };
}

async function generateOpenRouterResponses(
    request: ChatGenerationRequest,
    config: OpenRouterRuntimeConfig,
): Promise<ChatGenerationResult> {
    const uploadedFileIds: string[] = [];

    try {
        const preparedRequest = await uploadOpenRouterFiles(
            request,
            config,
            uploadedFileIds,
        );
        const body = createOpenRouterResponsesBody(preparedRequest, config);
        const targetUrl = `${openRouterBaseUrl}/responses`;
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
            return consumeResponsesApiStream(response, request, {
                emptyMessage: "OpenRouter stream did not include message content.",
                provider: "openrouter",
            });
        }

        const data = (await response.json()) as OpenRouterResponsesResponse;
        return normalizeOpenRouterResponsesResponse(data);
    } finally {
        await deleteOpenRouterFiles(config, uploadedFileIds);
    }
}

async function uploadOpenRouterFiles(
    request: ChatGenerationRequest,
    config: OpenRouterRuntimeConfig,
    uploadedFileIds: string[],
) {
    return mapFileContentParts(request, async (file) => {
        if (!file.file_data) {
            return file;
        }

        const blob = await filePartToBlob(file);
        const uploaded = await uploadOpenRouterFile(config, blob, file.filename);
        uploadedFileIds.push(uploaded.id);

        return {
            filename: file.filename,
            mime_type: uploaded.mimeType || file.mime_type || blob.type,
            url: uploaded.id,
        };
    });
}

export function createOpenRouterHeaders(config: Pick<OpenRouterRuntimeConfig, "apiKey">) {
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

async function uploadOpenRouterFile(
    config: OpenRouterRuntimeConfig,
    blob: Blob,
    filename = "attachment",
) {
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("purpose", "assistants");

    const response = await fetch(`${openRouterBaseUrl}/files`, {
        method: "POST",
        headers: createOpenRouterUploadHeaders(config),
        body: formData,
    });

    if (!response.ok) {
        throw new Error(
            `OpenRouter file upload failed: ${response.status} ${await openRouterErrorText(response)}`,
        );
    }

    const data = (await response.json()) as {
        id?: string;
        mime_type?: string;
    };

    if (!data.id) {
        throw new Error("OpenRouter file upload response was missing a file id.");
    }

    return {
        id: data.id,
        mimeType: data.mime_type,
    };
}

function createOpenRouterUploadHeaders(config: Pick<OpenRouterRuntimeConfig, "apiKey">) {
    const headers = createOpenRouterHeaders(config);
    delete headers["Content-Type"];
    return headers;
}

async function deleteOpenRouterFiles(config: OpenRouterRuntimeConfig, fileIds: string[]) {
    await Promise.allSettled(
        fileIds.map((fileId) =>
            fetch(`${openRouterBaseUrl}/files/${encodeURIComponent(fileId)}`, {
                method: "DELETE",
                headers: createOpenRouterHeaders(config),
            }),
        ),
    );
}
