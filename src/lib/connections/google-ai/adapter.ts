import { filePartToBlob, mapFileContentParts } from "../images";
import { safeResponseText, trimTrailingSlash } from "../http";
import type { ChatGenerationRequest, ConnectionAdapter } from "../types";

import { createGoogleAIGenerateBody, normalizeGoogleAIResponse } from "./mappers";
import { readGoogleAIStream } from "./streaming";
import type { GoogleAIGenerateContentResponse, GoogleAIRuntimeConfig } from "./types";

export function createGoogleAIConnection(
    config: GoogleAIRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "google-ai",
        label: "Google AI",
        buildPayload(request) {
            return createGoogleAIGenerateBody(request, config);
        },
        async generate(request) {
            const uploadedFiles: string[] = [];

            try {
                const preparedRequest = await uploadGoogleAIFiles(
                    request,
                    config,
                    uploadedFiles,
                );
                const body = createGoogleAIGenerateBody(preparedRequest, config);
                const targetUrl = createGoogleAIGenerateUrl(
                    config,
                    request.stream === true,
                );
                const displayUrl = createGoogleAIGenerateUrl(
                    { ...config, apiKey: undefined },
                    request.stream === true,
                );
                const response = await fetch(targetUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                    signal: request.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        `Google AI request failed at ${displayUrl}: ${response.status} ${await safeResponseText(response)}`,
                    );
                }

                if (request.stream) {
                    const streamResponse: GoogleAIGenerateContentResponse = {
                        candidates: [
                            {
                                content: {
                                    role: "model",
                                    parts: [],
                                },
                            },
                        ],
                    };

                    await readGoogleAIStream(
                        response,
                        (tokens, chunk) => {
                            mergeGoogleAIStreamChunk(streamResponse, chunk);
                            if (tokens.reasoning) {
                                request.onReasoningToken?.(tokens.reasoning);
                            }
                            if (tokens.message) {
                                request.onToken?.(tokens.message);
                            }
                            for (const image of tokens.images) {
                                request.onImage?.(image);
                            }
                        },
                        request.signal,
                    );

                    return normalizeGoogleAIResponse(streamResponse);
                }

                const data = (await response.json()) as GoogleAIGenerateContentResponse;
                return normalizeGoogleAIResponse(data);
            } finally {
                await deleteGoogleAIFiles(config, uploadedFiles);
            }
        },
    };
}

function mergeGoogleAIStreamChunk(
    target: GoogleAIGenerateContentResponse,
    chunk: GoogleAIGenerateContentResponse,
) {
    target.modelVersion = chunk.modelVersion ?? target.modelVersion;
    target.responseId = chunk.responseId ?? target.responseId;

    if (chunk.usageMetadata) {
        target.usageMetadata = {
            ...(target.usageMetadata ?? {}),
            ...(chunk.usageMetadata ?? {}),
        };
    }

    const targetCandidate = target.candidates?.[0];
    const chunkCandidate = chunk.candidates?.[0];

    if (!targetCandidate || !chunkCandidate) {
        return;
    }

    targetCandidate.finishReason =
        chunkCandidate.finishReason ?? targetCandidate.finishReason;
    targetCandidate.finishMessage =
        chunkCandidate.finishMessage ?? targetCandidate.finishMessage;

    if (chunkCandidate.content?.parts?.length) {
        targetCandidate.content ??= { role: "model", parts: [] };
        targetCandidate.content.parts.push(...chunkCandidate.content.parts);
    }
}

async function uploadGoogleAIFiles(
    request: ChatGenerationRequest,
    config: GoogleAIRuntimeConfig,
    uploadedFiles: string[],
) {
    return mapFileContentParts(request, async (file) => {
        if (!file.file_data) {
            return file;
        }

        const blob = await filePartToBlob(file);
        const uploaded = await uploadGoogleAIFile(config, blob, file.filename);
        uploadedFiles.push(uploaded.name);

        return {
            filename: file.filename,
            mime_type: uploaded.mimeType || file.mime_type || blob.type,
            url: uploaded.uri,
        };
    });
}

export function createGoogleAIGenerateUrl(
    config: GoogleAIRuntimeConfig,
    stream: boolean,
) {
    const method = stream ? "streamGenerateContent" : "generateContent";
    const target = new URL(
        `${trimTrailingSlash(config.baseUrl)}/${modelResourceName(config.model.id)}:${method}`,
    );

    if (stream) {
        target.searchParams.set("alt", "sse");
    }

    if (config.apiKey?.trim()) {
        target.searchParams.set("key", config.apiKey.trim());
    }

    return target.toString();
}

function modelResourceName(modelId: string) {
    const cleanModelId = modelId.trim().replace(/^\/+/, "");
    return cleanModelId.startsWith("models/")
        ? cleanModelId
        : `models/${encodeURIComponent(cleanModelId)}`;
}

async function uploadGoogleAIFile(
    config: GoogleAIRuntimeConfig,
    blob: Blob,
    filename = "attachment",
) {
    const startUrl = new URL(`${googleAIUploadBaseUrl(config.baseUrl)}/files`);
    if (config.apiKey?.trim()) {
        startUrl.searchParams.set("key", config.apiKey.trim());
    }

    const startResponse = await fetch(startUrl.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": String(blob.size),
            "X-Goog-Upload-Header-Content-Type": blob.type || "application/octet-stream",
            "X-Goog-Upload-Protocol": "resumable",
        },
        body: JSON.stringify({ file: { display_name: filename } }),
    });

    if (!startResponse.ok) {
        throw new Error(
            `Google AI file upload failed: ${startResponse.status} ${await safeResponseText(startResponse)}`,
        );
    }

    const uploadUrl = startResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
        throw new Error("Google AI file upload did not return an upload URL.");
    }

    const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "Content-Length": String(blob.size),
            "X-Goog-Upload-Command": "upload, finalize",
            "X-Goog-Upload-Offset": "0",
        },
        body: blob,
    });

    if (!uploadResponse.ok) {
        throw new Error(
            `Google AI file upload failed: ${uploadResponse.status} ${await safeResponseText(uploadResponse)}`,
        );
    }

    const data = (await uploadResponse.json()) as {
        file?: {
            mimeType?: string;
            name?: string;
            state?: string;
            uri?: string;
        };
    };
    const file = data.file;

    if (!file?.name || !file.uri) {
        throw new Error("Google AI file upload response was missing file metadata.");
    }

    const ready = await waitForGoogleAIFile(config, file.name, {
        mimeType: file.mimeType,
        name: file.name,
        state: file.state,
        uri: file.uri,
    });

    return {
        mimeType: ready.mimeType,
        name: ready.name,
        uri: ready.uri,
    };
}

export function googleAIUploadBaseUrl(baseUrl: string) {
    const trimmed = trimTrailingSlash(baseUrl);
    try {
        const url = new URL(trimmed);
        const versionMatch = url.pathname.match(/\/(v\d+(?:beta)?)$/i);
        const version = versionMatch?.[1] ?? "v1beta";
        url.pathname = `/upload/${version}`;
        return trimTrailingSlash(url.toString());
    } catch {
        return `${trimmed.replace(/\/(v\d+(?:beta)?)$/i, "")}/upload/v1beta`;
    }
}

async function waitForGoogleAIFile(
    config: GoogleAIRuntimeConfig,
    fileName: string,
    initial: {
        mimeType?: string;
        name: string;
        state?: string;
        uri: string;
    },
) {
    let current = initial;
    const deadline = Date.now() + 60_000;

    while (true) {
        const state = current.state?.toUpperCase();

        if (!state || state === "ACTIVE") {
            return {
                mimeType: current.mimeType,
                name: current.name,
                uri: current.uri,
            };
        }

        if (state === "FAILED") {
            throw new Error("Google AI file processing failed.");
        }

        if (Date.now() >= deadline) {
            throw new Error("Google AI file processing timed out.");
        }

        await delay(500);
        current = await getGoogleAIFile(config, fileName);
    }
}

async function getGoogleAIFile(config: GoogleAIRuntimeConfig, fileName: string) {
    const target = new URL(`${trimTrailingSlash(config.baseUrl)}/${fileName}`);
    if (config.apiKey?.trim()) {
        target.searchParams.set("key", config.apiKey.trim());
    }

    const response = await fetch(target.toString());

    if (!response.ok) {
        throw new Error(
            `Google AI file status failed: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    const data = (await response.json()) as {
        mimeType?: string;
        name?: string;
        state?: string;
        uri?: string;
    };

    if (!data.name || !data.uri) {
        throw new Error("Google AI file status response was missing file metadata.");
    }

    return {
        mimeType: data.mimeType,
        name: data.name,
        state: data.state,
        uri: data.uri,
    };
}

function delay(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function deleteGoogleAIFiles(config: GoogleAIRuntimeConfig, fileNames: string[]) {
    await Promise.allSettled(
        fileNames.map((name) => {
            const target = new URL(`${trimTrailingSlash(config.baseUrl)}/${name}`);
            if (config.apiKey?.trim()) {
                target.searchParams.set("key", config.apiKey.trim());
            }

            return fetch(target.toString(), { method: "DELETE" });
        }),
    );
}
