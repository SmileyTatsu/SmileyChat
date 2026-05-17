import { isRecord } from "#frontend/lib/common/guards";

import { BadRequestError, HttpError, json, readJsonBody } from "./http";

const opusFourSevenPlus = /^claude-opus-4-(?:[7-9]|\d{2,})/;
const installInstructions =
    "Install the Claude Code CLI ('npm i -g @anthropic-ai/claude-code'), run 'claude login', then retry.";

type GenerateRequestBody = {
    model: string;
    thinking: "off" | "adaptive";
    maxOutputTokens?: number;
    systemPrompt?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    stream: boolean;
};

type SdkOptions = {
    model: string;
    systemPrompt:
        | { type: "preset"; preset: "claude_code" }
        | { type: "preset"; preset: "claude_code"; append: string };
    tools: never[];
    permissionMode: "bypassPermissions";
    includePartialMessages: boolean;
    thinking?: { type: "adaptive" };
    maxOutputTokens?: number;
};

type SdkMessage =
    | { type: "stream_event"; event?: unknown }
    | { type: "assistant"; message?: unknown }
    | {
          type: "result";
          subtype?: "success" | "error";
          result?: string;
          error?: { message?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
      }
    | { type: string; [key: string]: unknown };

type SdkModule = {
    query: (input: {
        prompt: string;
        options: SdkOptions;
    }) => AsyncIterable<SdkMessage>;
};

let cachedSdk: Promise<SdkModule> | undefined;

async function loadSdk(): Promise<SdkModule> {
    if (!cachedSdk) {
        cachedSdk = import("@anthropic-ai/claude-agent-sdk").catch((error) => {
            cachedSdk = undefined;
            throw new HttpError(
                503,
                `Claude Agent SDK is not installed on the server. ${installInstructions} Underlying error: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }) as Promise<SdkModule>;
    }

    return cachedSdk;
}

export async function handleClaudeMaxStatus() {
    try {
        await loadSdk();
    } catch (error) {
        if (error instanceof HttpError) {
            return json({ ok: false, error: error.message }, error.status);
        }
        return json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown error.",
            },
            500,
        );
    }

    const version = await detectCliVersion();

    if (!version) {
        return json(
            {
                ok: false,
                error: `Claude CLI binary was not found on PATH. ${installInstructions}`,
            },
            503,
        );
    }

    return json({ ok: true, version });
}

export async function handleClaudeMaxGenerate(request: Request) {
    const body = await readGenerateBody(request);
    const sdk = await loadSdk();
    const sdkOptions = buildSdkOptions(body);
    const prompt = buildPromptFromMessages(body.messages);

    if (!prompt.trim()) {
        throw new BadRequestError("Claude Max needs at least one user message.");
    }

    if (body.stream) {
        return streamGeneration(sdk, prompt, sdkOptions, request.signal);
    }

    return collectGeneration(sdk, prompt, sdkOptions, request.signal);
}

function buildSdkOptions(body: GenerateRequestBody): SdkOptions {
    const baseSystem: SdkOptions["systemPrompt"] = body.systemPrompt?.trim()
        ? { type: "preset", preset: "claude_code", append: body.systemPrompt.trim() }
        : { type: "preset", preset: "claude_code" };

    const options: SdkOptions = {
        model: body.model,
        systemPrompt: baseSystem,
        tools: [],
        permissionMode: "bypassPermissions",
        includePartialMessages: body.stream,
    };

    if (body.thinking === "adaptive" && opusFourSevenPlus.test(body.model)) {
        options.thinking = { type: "adaptive" };
    }

    if (
        typeof body.maxOutputTokens === "number" &&
        Number.isFinite(body.maxOutputTokens) &&
        body.maxOutputTokens > 0
    ) {
        options.maxOutputTokens = Math.trunc(body.maxOutputTokens);
    }

    return options;
}

function buildPromptFromMessages(messages: GenerateRequestBody["messages"]) {
    return messages
        .map((message) =>
            message.role === "assistant"
                ? `Assistant: ${message.content}`
                : `User: ${message.content}`,
        )
        .join("\n\n");
}

async function streamGeneration(
    sdk: SdkModule,
    prompt: string,
    options: SdkOptions,
    signal: AbortSignal,
): Promise<Response> {
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const encoder = new TextEncoder();
            const writeChunk = (payload: Record<string, unknown>) => {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
            };
            const writeDone = () => {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            };

            try {
                let yieldedAnyText = false;

                for await (const message of sdk.query({ prompt, options })) {
                    if (signal.aborted) {
                        break;
                    }

                    if (message.type === "stream_event") {
                        const event = (message as { event?: unknown }).event;
                        const textDelta = extractTextDelta(event);

                        if (textDelta) {
                            yieldedAnyText = true;
                            writeChunk({
                                model: options.model,
                                choices: [
                                    {
                                        delta: { content: textDelta },
                                    },
                                ],
                            });
                        }
                        continue;
                    }

                    if (message.type === "result") {
                        const resultMessage = message as {
                            subtype?: string;
                            result?: string;
                            error?: { message?: string };
                        };

                        if (resultMessage.subtype === "success") {
                            if (!yieldedAnyText && resultMessage.result) {
                                writeChunk({
                                    model: options.model,
                                    choices: [
                                        {
                                            delta: { content: resultMessage.result },
                                        },
                                    ],
                                });
                            }

                            writeChunk({
                                model: options.model,
                                choices: [{ delta: {}, finish_reason: "stop" }],
                            });
                        } else {
                            writeChunk({
                                error: {
                                    message:
                                        resultMessage.error?.message ??
                                        "Claude Max generation failed.",
                                },
                            });
                        }
                        break;
                    }
                }

                writeDone();
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Claude Max stream failed.";

                try {
                    writeChunk({ error: { message } });
                    writeDone();
                } catch {
                    // The controller may already be closed.
                }
            } finally {
                try {
                    controller.close();
                } catch {
                    // Stream may have already closed.
                }
            }
        },
        cancel() {
            // The reader was cancelled by the client; nothing extra to clean up.
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

async function collectGeneration(
    sdk: SdkModule,
    prompt: string,
    options: SdkOptions,
    signal: AbortSignal,
): Promise<Response> {
    let message = "";
    let errorMessage: string | undefined;

    for await (const event of sdk.query({ prompt, options })) {
        if (signal.aborted) {
            break;
        }

        if (event.type === "result") {
            const result = event as {
                subtype?: string;
                result?: string;
                error?: { message?: string };
            };

            if (result.subtype === "success" && result.result) {
                message = result.result;
            } else {
                errorMessage =
                    result.error?.message ?? "Claude Max generation failed.";
            }
            break;
        }
    }

    if (errorMessage) {
        throw new HttpError(502, errorMessage);
    }

    if (!message.trim()) {
        throw new HttpError(502, "Claude Max returned an empty response.");
    }

    return json({ message: message.trim(), model: options.model });
}

function extractTextDelta(event: unknown): string | undefined {
    if (!isRecord(event)) {
        return undefined;
    }

    if (event.type !== "content_block_delta") {
        return undefined;
    }

    const delta = isRecord(event.delta) ? event.delta : undefined;

    if (!delta || delta.type !== "text_delta") {
        return undefined;
    }

    return typeof delta.text === "string" ? delta.text : undefined;
}

async function readGenerateBody(request: Request): Promise<GenerateRequestBody> {
    const raw = await readJsonBody(request);

    if (!isRecord(raw)) {
        throw new BadRequestError("Claude Max request body must be a JSON object.");
    }

    const model = typeof raw.model === "string" ? raw.model.trim() : "";

    if (!model) {
        throw new BadRequestError("Claude Max needs a model id.");
    }

    if (!Array.isArray(raw.messages)) {
        throw new BadRequestError("Claude Max needs a messages array.");
    }

    const messages: GenerateRequestBody["messages"] = [];

    for (const item of raw.messages) {
        if (!isRecord(item)) continue;
        const role = item.role;
        const content = item.content;

        if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
            continue;
        }

        if (content.trim()) {
            messages.push({ role, content });
        }
    }

    if (messages.length === 0) {
        throw new BadRequestError("Claude Max needs at least one user message.");
    }

    const maxOutputTokens =
        typeof raw.maxOutputTokens === "number" &&
        Number.isFinite(raw.maxOutputTokens) &&
        raw.maxOutputTokens > 0
            ? Math.trunc(raw.maxOutputTokens)
            : undefined;

    return {
        model,
        thinking: raw.thinking === "off" ? "off" : "adaptive",
        maxOutputTokens,
        systemPrompt:
            typeof raw.systemPrompt === "string" && raw.systemPrompt.trim()
                ? raw.systemPrompt
                : undefined,
        messages,
        stream: raw.stream === true,
    };
}

async function detectCliVersion(): Promise<string | undefined> {
    try {
        const proc = Bun.spawn(["claude", "--version"], {
            stdout: "pipe",
            stderr: "pipe",
        });
        const [stdout, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            proc.exited,
        ]);

        if (exitCode !== 0) {
            return undefined;
        }

        const trimmed = stdout.trim();
        return trimmed || "unknown";
    } catch {
        return undefined;
    }
}
