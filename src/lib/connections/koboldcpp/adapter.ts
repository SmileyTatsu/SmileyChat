import {
    formatCustomInstructPrompt,
    formatInstructPrompt,
    getInstructTemplateStopSequences,
} from "../../instruct";
import { parseDataImageUrl } from "../images";
import { safeResponseText, trimTrailingSlash } from "../http";
import { readJsonServerSentEvents } from "../streaming";
import type {
    ChatGenerationMessage,
    ChatGenerationRequest,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../types";
import type {
    KoboldCPPGenerateResponse,
    KoboldCPPRuntimeConfig,
    KoboldCPPStreamChunk,
} from "./types";
import type { PresetInstructTemplate } from "../../presets/types";

export function createKoboldCPPConnection(
    config: KoboldCPPRuntimeConfig,
): ConnectionAdapter {
    return {
        id: "koboldcpp",
        label: "KoboldCPP",
        buildPayload: (request) => createKoboldCPPBody(request, config),
        async generate(request) {
            const body = createKoboldCPPBody(request, config);
            const abort = () =>
                void fetch(createKoboldCPPAbortUrl(config), {
                    method: "POST",
                    headers: createHeaders(config),
                }).catch(() => undefined);
            request.signal?.addEventListener("abort", abort, { once: true });
            try {
                const url = createKoboldCPPGenerateUrl(config, request.stream === true);
                const response = await fetch(url, {
                    method: "POST",
                    headers: createHeaders(config),
                    body: JSON.stringify(body),
                    signal: request.signal,
                });
                if (!response.ok)
                    throw new Error(
                        `KoboldCPP request failed at ${url}: ${response.status} ${await safeResponseText(response)}`,
                    );
                if (request.stream)
                    return consumeKoboldCPPStream(response, request, config.model.id);
                const data = (await response.json()) as KoboldCPPGenerateResponse;
                const message = data.results?.[0]?.text?.trim();
                if (!message)
                    throw new Error("KoboldCPP did not include generated text.");
                return {
                    message,
                    provider: "koboldcpp",
                    model: config.model.id,
                    raw: data,
                };
            } finally {
                request.signal?.removeEventListener("abort", abort);
            }
        },
    };
}

export function createKoboldCPPBody(
    request: ChatGenerationRequest,
    config: KoboldCPPRuntimeConfig,
) {
    const messages = request.promptMessages ?? [];
    const generation = request.generation;
    const images = messages.flatMap((message) =>
        Array.isArray(message.content)
            ? message.content
                  .filter((part) => part.type === "image_url")
                  .map((part) => parseDataImageUrl(part.image_url.url)?.data)
                  .filter((value): value is string => Boolean(value))
            : [],
    );
    return {
        prompt: formatKoboldPrompt(messages, request, config),
        max_length: config.maxOutputTokens,
        max_context_length: config.maxContextLength ?? config.contextTokenBudget,
        trim_stop: true,
        quiet: true,
        ...(request.stream ? { stream: true } : {}),
        ...(images.length ? { images } : {}),
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topA === "number" ? { top_a: generation.topA } : {}),
        ...(typeof generation?.typicalP === "number"
            ? { typical: generation.typicalP }
            : {}),
        ...(typeof generation?.tfs === "number" ? { tfs: generation.tfs } : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(typeof generation?.topK === "number" ? { top_k: generation.topK } : {}),
        ...(typeof generation?.minP === "number" ? { min_p: generation.minP } : {}),
        ...(typeof generation?.repetitionPenalty === "number"
            ? { rep_pen: generation.repetitionPenalty }
            : {}),
        ...(typeof generation?.repetitionPenaltyRange === "number"
            ? { rep_pen_range: generation.repetitionPenaltyRange }
            : {}),
        ...(typeof generation?.presencePenalty === "number"
            ? { presence_penalty: generation.presencePenalty }
            : {}),
        ...(typeof generation?.frequencyPenalty === "number"
            ? { frequency_penalty: generation.frequencyPenalty }
            : {}),
        ...(typeof generation?.dryMultiplier === "number"
            ? { dry_multiplier: generation.dryMultiplier }
            : {}),
        ...(typeof generation?.dryBase === "number"
            ? { dry_base: generation.dryBase }
            : {}),
        ...(typeof generation?.dryAllowedLength === "number"
            ? { dry_allowed_length: generation.dryAllowedLength }
            : {}),
        ...(typeof generation?.dryPenaltyLastN === "number"
            ? { dry_penalty_last_n: generation.dryPenaltyLastN }
            : {}),
        ...(generation?.drySequenceBreakers?.length
            ? { dry_sequence_breakers: generation.drySequenceBreakers }
            : {}),
        ...(typeof generation?.xtcThreshold === "number"
            ? { xtc_threshold: generation.xtcThreshold }
            : {}),
        ...(typeof generation?.xtcProbability === "number"
            ? { xtc_probability: generation.xtcProbability }
            : {}),
        ...(typeof generation?.mirostatMode === "number"
            ? { mirostat: generation.mirostatMode }
            : {}),
        ...(typeof generation?.mirostatTau === "number"
            ? { mirostat_tau: generation.mirostatTau }
            : {}),
        ...(typeof generation?.mirostatEta === "number"
            ? { mirostat_eta: generation.mirostatEta }
            : {}),
        ...(generation?.samplerOrder?.length
            ? { sampler_order: generation.samplerOrder }
            : {}),
        stop_sequence: Array.from(
            new Set(
                [
                    ...builtInTemplateStops(
                        request.formatting?.instructTemplate,
                        config.model.id,
                    ),
                    ...(request.formatting?.stopSequences ?? []),
                    ...(generation?.stopSequences ?? []),
                ].filter(
                    (stop): stop is string => typeof stop === "string" && Boolean(stop),
                ),
            ),
        ),
        ...(typeof generation?.seed === "number"
            ? { sampler_seed: generation.seed }
            : {}),
    };
}
function builtInTemplateStops(
    template: PresetInstructTemplate | undefined,
    modelId: string,
) {
    if (template === "custom" || template === "none") return [];
    return getInstructTemplateStopSequences(resolveTemplate(template), modelId);
}
function resolveTemplate(template: PresetInstructTemplate | undefined) {
    return template === "chatml" ||
        template === "llama3" ||
        template === "mistral" ||
        template === "gemma2" ||
        template === "alpaca" ||
        template === "deepseek-r1"
        ? template
        : "auto";
}
function formatKoboldPrompt(
    messages: ChatGenerationMessage[],
    request: ChatGenerationRequest,
    config: KoboldCPPRuntimeConfig,
) {
    if (request.formatting?.instructTemplate === "custom")
        return formatCustomInstructPrompt(messages, request.formatting);
    if (request.formatting?.instructTemplate === "none")
        return messages
            .map((message) =>
                typeof message.content === "string"
                    ? message.content
                    : message.content
                          .map((part) => (part.type === "text" ? part.text : ""))
                          .join("\n"),
            )
            .join("\n");
    return formatInstructPrompt(
        messages,
        resolveTemplate(request.formatting?.instructTemplate),
        config.model.id,
        request.formatting,
    );
}
export function normalizeKoboldBaseUrl(baseUrl: string): string {
    let url = trimTrailingSlash(baseUrl.trim());
    if (url.endsWith("/api/v1")) {
        url = url.slice(0, -"/api/v1".length);
    } else if (url.endsWith("/api")) {
        url = url.slice(0, -"/api".length);
    }
    return trimTrailingSlash(url);
}

export const createKoboldCPPGenerateUrl = (
    config: Pick<KoboldCPPRuntimeConfig, "baseUrl">,
    stream: boolean,
) =>
    stream
        ? `${normalizeKoboldBaseUrl(config.baseUrl)}/api/extra/generate/stream`
        : `${normalizeKoboldBaseUrl(config.baseUrl)}/api/v1/generate`;

export const createKoboldCPPAbortUrl = (
    config: Pick<KoboldCPPRuntimeConfig, "baseUrl">,
) => `${normalizeKoboldBaseUrl(config.baseUrl)}/api/extra/abort`;

export const createKoboldCPPModelUrl = (
    config: Pick<KoboldCPPRuntimeConfig, "baseUrl">,
) => `${normalizeKoboldBaseUrl(config.baseUrl)}/api/v1/model`;

export const createKoboldCPPContextUrl = (
    config: Pick<KoboldCPPRuntimeConfig, "baseUrl">,
) => `${normalizeKoboldBaseUrl(config.baseUrl)}/api/v1/config/max_context_length`;

export const createKoboldCPPVersionUrl = (
    config: Pick<KoboldCPPRuntimeConfig, "baseUrl">,
) => `${normalizeKoboldBaseUrl(config.baseUrl)}/api/extra/version`;
async function consumeKoboldCPPStream(
    response: Response,
    request: ChatGenerationRequest,
    model: string,
): Promise<ChatGenerationResult> {
    let message = "";
    await readJsonServerSentEvents<KoboldCPPStreamChunk>(
        response,
        (chunk) => {
            if (chunk.error) throw new Error(`KoboldCPP stream failed: ${chunk.error}`);
            const token = chunk.token ?? chunk.text;
            if (token) {
                message += token;
                request.onToken?.(token);
            }
        },
        request.signal,
    );
    if (!message.trim())
        throw new Error("KoboldCPP stream did not include generated text.");
    return { message: message.trim(), provider: "koboldcpp", model };
}
function createHeaders(config: Pick<KoboldCPPRuntimeConfig, "apiKey">) {
    return {
        "Content-Type": "application/json",
        ...(config.apiKey?.trim()
            ? { Authorization: `Bearer ${config.apiKey.trim()}` }
            : {}),
    };
}
