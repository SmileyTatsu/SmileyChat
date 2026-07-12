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

import { BadRequestError, HttpError, json } from "./http";
import { readConnectionSecrets, readConnectionSettings } from "./settings";

type GenerationPayload = {
    profileId?: string;
    generation?: ChatGenerationRequest["generation"];
    promptMessages: ChatGenerationMessage[];
    stream?: boolean;
    tools?: ToolDefinition[];
};

const encoder = new TextEncoder();

// Interval between SSE heartbeat comments while a generation is pending. Every
// enqueued byte resets Bun's socket idle timer, so this keeps long streams and
// slow time-to-first-token windows alive well within the route timeout.
const HEARTBEAT_INTERVAL_MS = 5_000;

function logGeneration(message: string, detail?: Record<string, unknown>) {
    const suffix = detail
        ? " " +
          Object.entries(detail)
              .map(([key, value]) => `${key}=${value}`)
              .join(" ")
        : "";
    console.log(`[generate] ${message}${suffix}`);
}

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
    const startedAt = Date.now();

    logGeneration("start", {
        provider: profile.provider,
        profileId: profile.id,
        stream: payload.stream === true,
        promptMessages: payload.promptMessages.length,
        tools: payload.tools?.length ?? 0,
    });

    // A completed provider request does not need an SSE transport. Returning
    // JSON avoids a terminal-frame close race for non-streaming generation.
    if (!payload.stream) {
        try {
            const result = await adapter.generate({
                generation: payload.generation,
                messages: [],
                promptMessages: payload.promptMessages,
                signal,
                stream: false,
                tools: payload.tools,
            });
            logGeneration("done", {
                mode: "json",
                ms: Date.now() - startedAt,
                chars: result.message.length,
            });
            return json({ result: publicGenerationResult(result) });
        } catch (error) {
            logGeneration("error", {
                mode: "json",
                ms: Date.now() - startedAt,
                message: error instanceof Error ? error.message : String(error),
            });
            return json(
                {
                    error: error instanceof Error ? error.message : "Generation failed.",
                },
                502,
            );
        }
    }

    const generationController = new AbortController();
    const abortGeneration = () => generationController.abort();
    signal.addEventListener("abort", abortGeneration, { once: true });

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            let cancelled = false;
            let firstTokenAt = 0;
            let heartbeat: ReturnType<typeof setInterval> | undefined;

            // SSE comment lines (starting with ":") are ignored by the client
            // parser. Writing them keeps the socket active so Bun's idle
            // timeout never fires mid-generation.
            const sendComment = (text: string) => {
                if (cancelled) return;
                try {
                    controller.enqueue(encoder.encode(`: ${text}\n\n`));
                } catch {
                    cancelled = true;
                    generationController.abort();
                }
            };
            const send = (event: string, data: unknown) => {
                if (cancelled) return;

                try {
                    controller.enqueue(
                        encoder.encode(
                            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                        ),
                    );
                } catch {
                    cancelled = true;
                    generationController.abort();
                    logGeneration("enqueue-failed", { ms: Date.now() - startedAt });
                }
            };
            const noteFirstToken = () => {
                if (firstTokenAt) return;
                firstTokenAt = Date.now();
                logGeneration("first-token", { ms: firstTokenAt - startedAt });
            };

            // Flush an immediate byte so the socket is active before the
            // provider's first token arrives, then keep it warm on an interval.
            sendComment("open");
            heartbeat = setInterval(() => sendComment("ping"), HEARTBEAT_INTERVAL_MS);

            try {
                const result = await adapter.generate({
                    generation: payload.generation,
                    messages: [],
                    onImage: (url) => {
                        noteFirstToken();
                        send("image", { url });
                    },
                    onReasoningToken: (token) => {
                        noteFirstToken();
                        send("reasoning", { token });
                    },
                    onToken: (token) => {
                        noteFirstToken();
                        send("token", { token });
                    },
                    promptMessages: payload.promptMessages,
                    signal: generationController.signal,
                    stream: payload.stream === true,
                    tools: payload.tools,
                });
                send("done", publicGenerationResult(result));
                logGeneration("done", {
                    mode: "sse",
                    ms: Date.now() - startedAt,
                    ttftMs: firstTokenAt ? firstTokenAt - startedAt : "n/a",
                    chars: result.message.length,
                });
            } catch (error) {
                send("error", {
                    message:
                        error instanceof Error ? error.message : "Generation failed.",
                });
                logGeneration("error", {
                    mode: "sse",
                    ms: Date.now() - startedAt,
                    message: error instanceof Error ? error.message : String(error),
                });
            } finally {
                if (heartbeat) clearInterval(heartbeat);
                signal.removeEventListener("abort", abortGeneration);
                // Yield to the event loop so Bun flushes enqueued chunks to the socket
                await Bun.sleep(0);
                if (!cancelled) controller.close();
            }
        },
        cancel() {
            // Stop the provider fetch when the client closes its SSE reader;
            // this prevents a paid response from draining after a phone user
            // presses Stop or disconnects.
            logGeneration("client-cancel", { ms: Date.now() - startedAt });
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

export function publicGenerationResult(
    result: ChatGenerationResult,
): ChatGenerationResult {
    const { raw: _raw, ...publicResult } = result;
    return publicResult;
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
