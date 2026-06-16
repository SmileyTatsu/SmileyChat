import { safeResponseText, trimTrailingSlash } from "../http";
import type { ConnectionAdapter } from "../types";
import {
    createAnthropicMessageBody,
    createAnthropicReasoningDetails,
    normalizeAnthropicResponse,
} from "./mappers";
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
            const body = createAnthropicMessageBody(request, config);
            const targetUrl = createAnthropicMessagesUrl(config);
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: createAnthropicHeaders(config),
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

                if (!stream.message.trim()) {
                    throw new Error("Anthropic stream did not include message content.");
                }

                const reasoningDetails = createAnthropicReasoningDetails(
                    stream.response,
                    stream.message.trim(),
                );

                return {
                    message: stream.message.trim(),
                    provider: "anthropic",
                    model: stream.response.model,
                    ...(stream.reasoning.trim()
                        ? { reasoning: stream.reasoning.trim() }
                        : {}),
                    ...(reasoningDetails ? { reasoningDetails } : {}),
                };
            }

            const data = (await response.json()) as AnthropicCreateMessageResponse;
            return normalizeAnthropicResponse(data);
        },
    };
}

export function createAnthropicMessagesUrl(
    config: Pick<AnthropicRuntimeConfig, "baseUrl">,
) {
    return `${trimTrailingSlash(config.baseUrl)}/messages`;
}

export function createAnthropicHeaders(config: Pick<AnthropicRuntimeConfig, "apiKey">) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": anthropicVersion,
        "anthropic-dangerous-direct-browser-access": "true",
    };

    if (config.apiKey?.trim()) {
        headers["x-api-key"] = config.apiKey.trim();
    }

    return headers;
}
