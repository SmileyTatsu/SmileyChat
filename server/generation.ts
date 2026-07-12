// Server-owned generation for remote clients. The browser sends an already
// compiled prompt, but never receives the selected profile's API key or gets
// to choose an arbitrary provider URL.

import {
    applyConnectionSecrets,
    getActiveConnectionProfile,
    isAnthropicProfile,
    isGoogleAIProfile,
    isNovelAIProfile,
    isOpenAICompatibleProfile,
    isOpenRouterProfile,
    isXAIProfile,
    type ConnectionProfile,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import { createAnthropicConnection } from "#frontend/lib/connections/anthropic/adapter";
import { createGoogleAIConnection } from "#frontend/lib/connections/google-ai/adapter";
import { createNovelAIConnection } from "#frontend/lib/connections/novelai/adapter";
import { createOpenAICompatibleConnection } from "#frontend/lib/connections/openai-compatible/adapter";
import { createOpenRouterConnection } from "#frontend/lib/connections/openrouter/adapter";
import { createXAIConnection } from "#frontend/lib/connections/xai/adapter";
import { listAnthropicModels } from "#frontend/lib/connections/anthropic/models";
import { listGoogleAIModels } from "#frontend/lib/connections/google-ai/models";
import { listOpenAICompatibleModels } from "#frontend/lib/connections/openai-compatible/models";
import { listOpenRouterModels } from "#frontend/lib/connections/openrouter/models";
import { listXAIModels } from "#frontend/lib/connections/xai/models";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
    ToolDefinition,
} from "#frontend/lib/connections/types";

import { BadRequestError, HttpError } from "./http";
import { readConnectionSecrets, readConnectionSettings } from "./settings";

type GenerationPayload = {
    profileId?: string;
    generation?: ChatGenerationRequest["generation"];
    promptMessages: ChatGenerationMessage[];
    stream?: boolean;
    tools?: ToolDefinition[];
};

const encoder = new TextEncoder();

export async function generateWithSavedConnection(
    value: unknown,
    signal: AbortSignal,
): Promise<Response> {
    const payload = parseGenerationPayload(value);
    const [settings, secrets] = await Promise.all([
        readConnectionSettings(),
        readConnectionSecrets(),
    ]);
    const privateSettings = applyConnectionSecrets(settings, secrets);
    const profile = resolveProfile(privateSettings, payload.profileId);
    const adapter = createBuiltInAdapter(profile);

    // The response remains an SSE stream even when streaming is disabled. It
    // gives the client one uniform, abortable transport without ever exposing
    // the provider response or credentials directly to the browser.
    const generationController = new AbortController();
    const abortGeneration = () => generationController.abort();
    signal.addEventListener("abort", abortGeneration, { once: true });

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
            };

            try {
                const result = await adapter.generate({
                    generation: payload.generation,
                    messages: [],
                    onImage: (url) => send("image", { url }),
                    onReasoningToken: (token) => send("reasoning", { token }),
                    onToken: (token) => send("token", { token }),
                    promptMessages: payload.promptMessages,
                    signal: generationController.signal,
                    stream: payload.stream === true,
                    tools: payload.tools,
                });
                send("done", result);
            } catch (error) {
                send("error", {
                    message:
                        error instanceof Error ? error.message : "Generation failed.",
                });
            } finally {
                signal.removeEventListener("abort", abortGeneration);
                controller.close();
            }
        },
        cancel() {
            // Stop the provider fetch when the client closes its SSE reader;
            // this prevents a paid response from draining after a phone user
            // presses Stop or disconnects.
            generationController.abort();
        },
    });

    return new Response(body, {
        headers: {
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Accel-Buffering": "no",
        },
    });
}

export async function listSavedConnectionModels(profileId: string): Promise<unknown[]> {
    const [settings, secrets] = await Promise.all([
        readConnectionSettings(),
        readConnectionSecrets(),
    ]);
    const profile = resolveProfile(applyConnectionSecrets(settings, secrets), profileId);

    if (isOpenAICompatibleProfile(profile)) {
        return listOpenAICompatibleModels(profile.config);
    }
    if (isOpenRouterProfile(profile)) return listOpenRouterModels(profile.config);
    if (isGoogleAIProfile(profile)) return listGoogleAIModels(profile.config);
    if (isAnthropicProfile(profile)) return listAnthropicModels(profile.config);
    if (isXAIProfile(profile)) return listXAIModels(profile.config);

    throw new HttpError(
        400,
        `Model loading is not available for the ${profile.provider} provider.`,
    );
}

function parseGenerationPayload(value: unknown): GenerationPayload {
    if (!isRecord(value) || !Array.isArray(value.promptMessages)) {
        throw new BadRequestError("Generation request must include prompt messages.");
    }

    if (!value.promptMessages.every(isChatGenerationMessage)) {
        throw new BadRequestError(
            "Generation request contains an invalid prompt message.",
        );
    }

    if (value.promptMessages.length === 0) {
        throw new BadRequestError("Generation request cannot be empty.");
    }

    if (typeof value.profileId !== "undefined" && typeof value.profileId !== "string") {
        throw new BadRequestError("Generation profile ID must be a string.");
    }

    return {
        profileId: value.profileId,
        generation: isRecord(value.generation)
            ? (value.generation as ChatGenerationRequest["generation"])
            : undefined,
        promptMessages: value.promptMessages,
        stream: value.stream === true,
        tools: Array.isArray(value.tools) ? (value.tools as ToolDefinition[]) : undefined,
    };
}

function resolveProfile(settings: ConnectionSettings, requestedId?: string) {
    const profile = requestedId
        ? settings.profiles.find((candidate) => candidate.id === requestedId)
        : getActiveConnectionProfile(settings);

    if (!profile) {
        throw new HttpError(404, "The selected connection profile does not exist.");
    }

    return profile;
}

function createBuiltInAdapter(profile: ConnectionProfile): ConnectionAdapter {
    if (isOpenAICompatibleProfile(profile)) {
        return createOpenAICompatibleConnection(profile.config);
    }
    if (isOpenRouterProfile(profile)) return createOpenRouterConnection(profile.config);
    if (isGoogleAIProfile(profile)) return createGoogleAIConnection(profile.config);
    if (isAnthropicProfile(profile)) return createAnthropicConnection(profile.config);
    if (isNovelAIProfile(profile)) return createNovelAIConnection(profile.config);
    if (isXAIProfile(profile)) return createXAIConnection(profile.config);

    throw new HttpError(
        400,
        `Server-side generation is not available for the ${profile.provider} provider.`,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatGenerationMessage(value: unknown): value is ChatGenerationMessage {
    if (!isRecord(value) || typeof value.role !== "string") return false;
    if (
        value.role !== "system" &&
        value.role !== "developer" &&
        value.role !== "user" &&
        value.role !== "assistant"
    ) {
        return false;
    }

    return typeof value.content === "string" || Array.isArray(value.content);
}
