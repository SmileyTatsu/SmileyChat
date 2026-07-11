import { filePartToBlob, hasFileContent, mapFileContentParts } from "../images";
import { safeResponseText, trimTrailingSlash } from "../http";
import type { ChatGenerationRequest, ConnectionAdapter } from "../types";
import { createAnthropicMessageBody, normalizeAnthropicResponse } from "./mappers";
import { readAnthropicStream } from "./streaming";
import type { AnthropicCreateMessageResponse, AnthropicRuntimeConfig } from "./types";

export const anthropicVersion = "2023-06-01";

export function createAnthropicConnection(
    config: AnthropicRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "anthropic",
        label: "Anthropic",
        buildPayload(request) {
            return createAnthropicMessageBody(request, config);
        },
        async generate(request) {
            const uploadedFileIds: string[] = [];

            try {
                const preparedRequest = await uploadAnthropicFiles(
                    request,
                    config,
                    uploadedFileIds,
                );
                const body = createAnthropicMessageBody(preparedRequest, config);
                const targetUrl = createAnthropicMessagesUrl(config);
                const response = await fetch(targetUrl, {
                    method: "POST",
                    headers: createAnthropicHeaders(config, {
                        filesBeta:
                            uploadedFileIds.length > 0 ||
                            hasFileContent(preparedRequest.promptMessages ?? []),
                    }),
                    body: JSON.stringify(body),
                    signal: request.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        `Anthropic request failed at ${targetUrl}: ${response.status} ${await safeResponseText(response)}`,
                    );
                }

                if (body.stream) {
                    const stream = await readAnthropicStream(
                        response,
                        (tokens) => {
                            if (tokens.reasoning) {
                                request.onReasoningToken?.(tokens.reasoning);
                            }

                            if (tokens.message) {
                                request.onToken?.(tokens.message);
                            }
                        },
                        request.signal,
                    );

                    return normalizeAnthropicResponse(stream.response);
                }

                const data = (await response.json()) as AnthropicCreateMessageResponse;
                return normalizeAnthropicResponse(data);
            } finally {
                await deleteAnthropicFiles(config, uploadedFileIds);
            }
        },
    };
}

async function uploadAnthropicFiles(
    request: ChatGenerationRequest,
    config: AnthropicRuntimeConfig,
    uploadedFileIds: string[],
) {
    return mapFileContentParts(request, async (file) => {
        if (!file.file_data) {
            return file;
        }

        const mimeType = file.mime_type ?? "";
        const isSupported =
            mimeType === "application/pdf" ||
            mimeType === "text/plain" ||
            mimeType.startsWith("image/");

        if (!isSupported) {
            throw new Error(
                `Anthropic file input does not support ${mimeType || "this file type"}. Use PDF, plain text, or images.`,
            );
        }

        const blob = await filePartToBlob(file);
        const uploaded = await uploadAnthropicFile(config, blob, file.filename);
        uploadedFileIds.push(uploaded.id);

        return {
            filename: file.filename,
            mime_type: uploaded.mimeType || file.mime_type || blob.type,
            url: uploaded.id,
        };
    });
}

export function createAnthropicMessagesUrl(
    config: Pick<AnthropicRuntimeConfig, "baseUrl">,
) {
    return `${trimTrailingSlash(config.baseUrl)}/messages`;
}

export function createAnthropicHeaders(
    config: Pick<AnthropicRuntimeConfig, "apiKey">,
    options: { filesBeta?: boolean } = {},
) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": anthropicVersion,
        "anthropic-dangerous-direct-browser-access": "true",
    };

    if (options.filesBeta) {
        headers["anthropic-beta"] = "files-api-2025-04-14";
    }

    if (config.apiKey?.trim()) {
        headers["x-api-key"] = config.apiKey.trim();
    }

    return headers;
}

async function uploadAnthropicFile(
    config: AnthropicRuntimeConfig,
    blob: Blob,
    filename = "attachment",
) {
    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/files`, {
        method: "POST",
        headers: createAnthropicUploadHeaders(config),
        body: formData,
    });

    if (!response.ok) {
        throw new Error(
            `Anthropic file upload failed: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    const data = (await response.json()) as {
        id?: string;
        mime_type?: string;
    };

    if (!data.id) {
        throw new Error("Anthropic file upload response was missing a file id.");
    }

    return {
        id: data.id,
        mimeType: data.mime_type,
    };
}

function createAnthropicUploadHeaders(config: Pick<AnthropicRuntimeConfig, "apiKey">) {
    const headers = createAnthropicHeaders(config, { filesBeta: true });
    delete headers["Content-Type"];
    return headers;
}

async function deleteAnthropicFiles(config: AnthropicRuntimeConfig, fileIds: string[]) {
    await Promise.allSettled(
        fileIds.map((fileId) =>
            fetch(
                `${trimTrailingSlash(config.baseUrl)}/files/${encodeURIComponent(fileId)}`,
                {
                    method: "DELETE",
                    headers: createAnthropicHeaders(config, { filesBeta: true }),
                },
            ),
        ),
    );
}
