// Server-owned generation for remote clients. The browser sends an already
// compiled prompt, but never receives the selected profile's API key or gets
// to choose an arbitrary provider URL.

import {
    applyConnectionSecrets,
    getActiveConnectionProfile,
    isAnthropicProfile,
    isGoogleAIProfile,
    isKoboldCPPProfile,
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
import { createKoboldCPPConnection } from "#frontend/lib/connections/koboldcpp/adapter";
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
import { prepareGenerationRequest } from "#frontend/lib/connections/request-validation";

import { BadRequestError, HttpError, json } from "./http";
import { readConnectionSecrets, readConnectionSettings } from "./settings";
import { logger, sensitiveLog } from "./logger";

type GenerationPayload = {
    profileId?: string;
    generation?: ChatGenerationRequest["generation"];
    formatting?: ChatGenerationRequest["formatting"];
    promptMessages: ChatGenerationMessage[];
    stream?: boolean;
    tools?: ToolDefinition[];
};

const encoder = new TextEncoder();

// Interval between SSE heartbeat comments while a generation is pending. Every
// enqueued byte resets Bun's socket idle timer, so this keeps long streams and
// slow time-to-first-token windows alive well within the route timeout.
const HEARTBEAT_INTERVAL_MS = 5_000;

export async function generateWithSavedConnection(
    value: unknown,
    signal: AbortSignal,
): Promise<Response> {
    let payload = parseGenerationPayload(value);
    const [settings, secrets] = await Promise.all([
        readConnectionSettings(),
        readConnectionSecrets(),
    ]);
    const privateSettings = applyConnectionSecrets(settings, secrets);
    const sourceProfile = resolveProfile(privateSettings, payload.profileId);
    const prepared = prepareGenerationRequest(sourceProfile, {
        generation: payload.generation,
        messages: [],
        promptMessages: payload.promptMessages,
        stream: payload.stream,
        tools: payload.tools,
    });
    const profile = prepared.profile;
    payload = {
        ...payload,
        generation: prepared.request.generation,
    };
    const adapter = createBuiltInAdapter(profile);
    const startedAt = Date.now();

    const isTextCompletion = adapter.promptMode === "text-completion";
    const mode = isTextCompletion
        ? `text-completion${payload.formatting?.instructTemplate ? ` (instruct: ${payload.formatting.instructTemplate})` : ""}`
        : "chat-completion";

    const promptStats = promptDiagnostics(payload.promptMessages);
    logger.info("generate", "START", {
        provider: profile.provider,
        profileId: profile.id,
        profile: profile.name,
        model: configuredModel(profile),
        baseUrl: safeBaseUrl(profile),
        mode,
        stream: payload.stream === true,
        tools: payload.tools?.length ?? 0,
    });
    logger.info("generate", "PROMPT", {
        ...promptStats,
        toolNames: payload.tools?.map((tool) => tool.name).join(",") || "none",
    });
    logger.debug("generate", "SAMPLING", generationDiagnostics(payload.generation));
    logger.debug("generate", "VALIDATION", {
        provider: profile.provider,
        model: configuredModel(profile),
        metadataSource: prepared.metadataSource,
        ...(prepared.inputTokenLimit
            ? { inputTokenLimit: prepared.inputTokenLimit }
            : {}),
        changes: prepared.changes,
    });
    sensitiveLog("generate", "RAW PROMPT", { messages: payload.promptMessages });

    // A completed provider request does not need an SSE transport. Returning
    // JSON avoids a terminal-frame close race for non-streaming generation.
    if (!payload.stream) {
        try {
            const result = await adapter.generate({
                generation: payload.generation,
                formatting: payload.formatting,
                messages: [],
                promptMessages: payload.promptMessages,
                signal,
                stream: false,
                tools: payload.tools,
            });
            logGenerationDone(result, startedAt, "json");
            return json({ result: publicGenerationResult(result) });
        } catch (error) {
            logGenerationError(error, startedAt, "json");
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

    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            let firstTokenAt = 0;
            let heartbeat: ReturnType<typeof setInterval> | undefined;

            // SSE comment lines (starting with ":") are ignored by the client
            // parser. Writing them keeps the socket active so Bun's idle
            // timeout never fires mid-generation.
            const sendComment = (text: string) => {
                if (cancelled || generationController.signal.aborted) return;
                try {
                    controller.enqueue(encoder.encode(`: ${text}\n\n`));
                } catch {
                    cancelled = true;
                    generationController.abort();
                }
            };
            const send = (event: string, data: unknown) => {
                if (cancelled || generationController.signal.aborted) return;

                try {
                    controller.enqueue(
                        encoder.encode(
                            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                        ),
                    );
                } catch {
                    cancelled = true;
                    generationController.abort();
                    logger.warn("generate", "SSE enqueue failed", {
                        durationMs: Date.now() - startedAt,
                    });
                }
            };
            const noteFirstToken = () => {
                if (firstTokenAt) return;
                firstTokenAt = Date.now();
                logger.info("generate", "STREAM first-token", {
                    ttftMs: firstTokenAt - startedAt,
                });
            };

            // Flush an immediate byte so the socket is active before the
            // provider's first token arrives, then keep it warm on an interval.
            sendComment("open");
            heartbeat = setInterval(() => sendComment("ping"), HEARTBEAT_INTERVAL_MS);

            try {
                let reasoningStartedAt = 0;
                const result = await adapter.generate({
                    generation: payload.generation,
                    formatting: payload.formatting,
                    messages: [],
                    onImage: (url) => {
                        noteFirstToken();
                        send("image", { url });
                    },
                    onReasoningToken: (token) => {
                        noteFirstToken();
                        if (!reasoningStartedAt) {
                            reasoningStartedAt = Date.now();
                            logger.debug("generate", "STREAM reasoning", {
                                ttftMs: reasoningStartedAt - startedAt,
                            });
                        }
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
                if (reasoningStartedAt)
                    logger.debug("generate", "STREAM reasoning complete", {
                        durationMs: Date.now() - reasoningStartedAt,
                    });
                logGenerationDone(result, startedAt, "sse", firstTokenAt || undefined);
            } catch (error) {
                const isAborted =
                    cancelled ||
                    generationController.signal.aborted ||
                    signal.aborted ||
                    (error instanceof DOMException && error.name === "AbortError") ||
                    (error instanceof Error &&
                        (error.name === "AbortError" ||
                            error.message.toLowerCase().includes("aborted")));

                if (!isAborted) {
                    send("error", {
                        message:
                            error instanceof Error ? error.message : "Generation failed.",
                    });
                    logGenerationError(error, startedAt, "sse");
                }
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
            cancelled = true;
            logger.info("generate", "CANCEL client-cancel", {
                durationMs: Date.now() - startedAt,
            });
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

export function extractUsageTokens(raw: unknown): {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
} {
    if (!raw || typeof raw !== "object") return {};
    const record = raw as Record<string, unknown>;

    const usage =
        record.usage && typeof record.usage === "object"
            ? (record.usage as Record<string, unknown>)
            : undefined;
    if (usage) {
        const prompt =
            typeof usage.prompt_tokens === "number"
                ? usage.prompt_tokens
                : typeof usage.input_tokens === "number"
                  ? usage.input_tokens
                  : typeof usage.promptTokens === "number"
                    ? usage.promptTokens
                    : undefined;
        const completion =
            typeof usage.completion_tokens === "number"
                ? usage.completion_tokens
                : typeof usage.output_tokens === "number"
                  ? usage.output_tokens
                  : typeof usage.completionTokens === "number"
                    ? usage.completionTokens
                    : undefined;
        const total =
            typeof usage.total_tokens === "number"
                ? usage.total_tokens
                : typeof usage.totalTokens === "number"
                  ? usage.totalTokens
                  : prompt !== undefined && completion !== undefined
                    ? prompt + completion
                    : undefined;

        return {
            ...(prompt !== undefined ? { promptTokens: prompt } : {}),
            ...(completion !== undefined ? { completionTokens: completion } : {}),
            ...(total !== undefined ? { totalTokens: total } : {}),
        };
    }

    const usageMetadata =
        record.usageMetadata && typeof record.usageMetadata === "object"
            ? (record.usageMetadata as Record<string, unknown>)
            : undefined;
    if (usageMetadata) {
        const prompt =
            typeof usageMetadata.promptTokenCount === "number"
                ? usageMetadata.promptTokenCount
                : undefined;
        const completion =
            typeof usageMetadata.candidatesTokenCount === "number"
                ? usageMetadata.candidatesTokenCount
                : undefined;
        const total =
            typeof usageMetadata.totalTokenCount === "number"
                ? usageMetadata.totalTokenCount
                : prompt !== undefined && completion !== undefined
                  ? prompt + completion
                  : undefined;

        return {
            ...(prompt !== undefined ? { promptTokens: prompt } : {}),
            ...(completion !== undefined ? { completionTokens: completion } : {}),
            ...(total !== undefined ? { totalTokens: total } : {}),
        };
    }

    return {};
}

export function extractFinishReason(raw: unknown): string {
    if (!raw || typeof raw !== "object") return "stop";
    const record = raw as Record<string, unknown>;

    if (typeof record.finish_reason === "string") return record.finish_reason;
    if (typeof record.stop_reason === "string") {
        const reason = record.stop_reason;
        if (reason === "end_turn" || reason === "stop_sequence") return "stop";
        if (reason === "max_tokens") return "length";
        if (reason === "tool_use") return "tool_calls";
        return reason;
    }
    if (
        Array.isArray(record.choices) &&
        record.choices[0] &&
        typeof record.choices[0] === "object"
    ) {
        const choice = record.choices[0] as Record<string, unknown>;
        if (typeof choice.finish_reason === "string") return choice.finish_reason;
    }
    if (
        Array.isArray(record.candidates) &&
        record.candidates[0] &&
        typeof record.candidates[0] === "object"
    ) {
        const candidate = record.candidates[0] as Record<string, unknown>;
        if (typeof candidate.finishReason === "string") {
            const reason = candidate.finishReason.toLowerCase();
            if (reason === "stop") return "stop";
            if (reason === "max_tokens") return "length";
            return reason;
        }
    }
    return "stop";
}

function logGenerationDone(
    result: ChatGenerationResult,
    startedAt: number,
    mode: string,
    firstTokenAt?: number,
) {
    const durationMs = Date.now() - startedAt;
    const estimatedTokens = Math.max(1, Math.ceil(result.message.length / 4));
    const finishReason = extractFinishReason(result.raw);
    const usageTokens = extractUsageTokens(result.raw);

    logger.info(
        "generate",
        `DONE ${finishReason === "length" ? "[TRUNCATED] " : ""}${mode}`,
        {
            durationMs,
            ...(firstTokenAt ? { ttftMs: firstTokenAt - startedAt } : {}),
            chars: result.message.length,
            estimatedTokens,
            tokPerSec: Number(
                (estimatedTokens / Math.max(durationMs / 1000, 0.001)).toFixed(1),
            ),
            finishReason,
            ...usageTokens,
        },
    );
}

function logGenerationError(error: unknown, startedAt: number, mode: string) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
        error && typeof error === "object" && "status" in error
            ? (error as { status: unknown }).status
            : undefined;
    logger.error("generate", mode, {
        durationMs: Date.now() - startedAt,
        ...(status ? { status } : {}),
        message,
    });
}

function promptDiagnostics(messages: ChatGenerationMessage[]) {
    const roles = { system: 0, developer: 0, user: 0, assistant: 0, images: 0, files: 0 };
    let characters = 0;
    for (const message of messages) {
        roles[message.role] += 1;
        if (typeof message.content === "string") characters += message.content.length;
        else
            for (const part of message.content) {
                characters += JSON.stringify(part).length;
                const type =
                    typeof part === "object" && part && "type" in part
                        ? String((part as { type: unknown }).type)
                        : "";
                if (type.includes("image")) roles.images += 1;
                if (type.includes("file")) roles.files += 1;
            }
    }
    return {
        messages: messages.length,
        system: roles.system + roles.developer,
        user: roles.user,
        assistant: roles.assistant,
        images: roles.images,
        files: roles.files,
        estimatedTokens: Math.ceil(characters / 4),
    };
}

function configuredModel(profile: ConnectionProfile) {
    const config = profile.config as Record<string, unknown>;
    const model = config.model;
    if (typeof model === "string") return model;
    if (model && typeof model === "object" && "id" in model)
        return String((model as { id: unknown }).id);
    return "default";
}
function safeBaseUrl(profile: ConnectionProfile) {
    const value = (profile.config as Record<string, unknown>).baseUrl;
    try {
        const url = new URL(typeof value === "string" ? value : "");
        return `${url.protocol}//${url.host}`;
    } catch {
        return "configured";
    }
}

function generationDiagnostics(generation: GenerationPayload["generation"]) {
    if (!generation || typeof generation !== "object") return {};
    const value = generation as Record<string, unknown>;
    return Object.fromEntries(
        [
            "temperature",
            "maxTokens",
            "max_tokens",
            "topP",
            "top_p",
            "reasoningEffort",
            "reasoning_effort",
        ]
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, value[key]]),
    );
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
        formatting: isRecord(value.formatting)
            ? (value.formatting as ChatGenerationRequest["formatting"])
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
    if (isKoboldCPPProfile(profile)) {
        return createKoboldCPPConnection({
            ...profile.config,
            contextTokenBudget: profile.contextTokenBudget,
        });
    }

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
