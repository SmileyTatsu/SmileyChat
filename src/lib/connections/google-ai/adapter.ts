import type { ConnectionAdapter } from "../types";
import { safeResponseText, trimTrailingSlash } from "../http";
import {
    createGoogleAIGenerateBody,
    createGoogleAIReasoningDetails,
    normalizeGoogleAIResponse,
} from "./mappers";
import { readGoogleAIStream } from "./streaming";
import type { GoogleAIGenerateContentResponse, GoogleAIRuntimeConfig } from "./types";

export function createGoogleAIConnection(
    config: GoogleAIRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "google-ai",
        label: "Google AI",
        async generate(request) {
            const body = createGoogleAIGenerateBody(request, config);
            const targetUrl = createGoogleAIGenerateUrl(config, request.stream === true);
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
            });

            if (!response.ok) {
                throw new Error(
                    `Google AI request failed at ${displayUrl}: ${response.status} ${await safeResponseText(response)}`,
                );
            }

            if (request.stream) {
                let message = "";
                let reasoning = "";
                let model: string | undefined;
                let lastChunk: GoogleAIGenerateContentResponse | undefined;

                await readGoogleAIStream(response, (tokens, chunk) => {
                    message += tokens.message;
                    reasoning += tokens.reasoning;
                    model = chunk.modelVersion ?? model;
                    lastChunk = chunk;
                    if (tokens.reasoning) {
                        request.onReasoningToken?.(tokens.reasoning);
                    }
                    if (tokens.message) {
                        request.onToken?.(tokens.message);
                    }
                });

                if (!message.trim()) {
                    throw new Error("Google AI stream did not include message content.");
                }

                const reasoningDetails = lastChunk
                    ? createGoogleAIReasoningDetails(lastChunk, message.trim())
                    : undefined;

                return {
                    message: message.trim(),
                    provider: "google-ai",
                    model,
                    ...(reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
                    ...(reasoningDetails ? { reasoningDetails } : {}),
                };
            }

            const data = (await response.json()) as GoogleAIGenerateContentResponse;
            return normalizeGoogleAIResponse(data);
        },
    };
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
