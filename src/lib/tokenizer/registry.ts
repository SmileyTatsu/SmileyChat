import { Tiktoken } from "js-tiktoken/lite";
import { signal } from "@preact/signals";

import { detectTokenizerAlgorithm } from "./auto-detect";
import type {
    LocalTokenCount,
    TokenCountContext,
    TokenizerAlgorithm,
    TokenizerSelection,
} from "./types";

type TiktokenRanks = ConstructorParameters<typeof Tiktoken>[0];

const cachedEncoders = new Map<TokenizerAlgorithm, Tiktoken>();
const loadingEncoders = new Map<TokenizerAlgorithm, Promise<Tiktoken | undefined>>();
const maxCachedEncoders = 2;

/** Active profile context for lightweight UI counters. */
export const activeTokenCountContext = signal<TokenCountContext | undefined>(undefined);

export function setActiveTokenCountContext(context: TokenCountContext | undefined) {
    activeTokenCountContext.value = context;
}

export function tokenizerContextForProfile(profile: {
    provider: TokenCountContext["provider"];
    tokenizer?: TokenizerSelection;
    config: Record<string, unknown>;
}): TokenCountContext {
    const model = profile.config.model;
    const modelId =
        model &&
        typeof model === "object" &&
        "id" in model &&
        typeof model.id === "string"
            ? model.id
            : "";
    return {
        provider: profile.provider,
        modelId,
        selection: profile.tokenizer ?? { mode: "auto" },
    };
}

export function resolvedTokenizerAlgorithm(
    context: TokenCountContext,
): TokenizerAlgorithm {
    return context.selection.mode === "manual" && context.selection.algorithm
        ? context.selection.algorithm
        : detectTokenizerAlgorithm(context.provider, context.modelId);
}

export async function preloadTokenizer(context: TokenCountContext) {
    const algorithm = resolvedTokenizerAlgorithm(context);
    await getTokenizer(algorithm);
}

export function estimateTextForContext(
    value: string,
    context?: TokenCountContext,
): LocalTokenCount {
    const algorithm = context ? resolvedTokenizerAlgorithm(context) : "heuristic";
    const encoder = cachedEncoders.get(algorithm);

    if (encoder) {
        return {
            algorithm,
            exact: true,
            tokens: value ? encoder.encode(value).length : 0,
        };
    }

    void getTokenizer(algorithm);
    return { algorithm, exact: false, tokens: conservativeHeuristicTokens(value) };
}

export function conservativeHeuristicTokens(value: string) {
    if (!value) return 0;
    // Intentionally conservative for unknown tokenizers, code, and CJK content.
    return Math.ceil(utf8ByteLength(value) / 2.6);
}

async function getTokenizer(algorithm: TokenizerAlgorithm) {
    if (!isTiktokenAlgorithm(algorithm)) return undefined;
    const cached = cachedEncoders.get(algorithm);
    if (cached) return cached;

    const loading = loadingEncoders.get(algorithm);
    if (loading) return loading;

    const request = loadTiktokenRanks(algorithm)
        .then((ranks) => {
            if (!ranks) return undefined;
            const encoder = new Tiktoken(ranks);
            cachedEncoders.set(algorithm, encoder);
            trimEncoderCache(algorithm);
            return encoder;
        })
        .finally(() => loadingEncoders.delete(algorithm));
    loadingEncoders.set(algorithm, request);
    return request;
}

function isTiktokenAlgorithm(
    algorithm: TokenizerAlgorithm,
): algorithm is "o200k_base" | "cl100k_base" | "p50k_base" | "r50k_base" {
    return (
        algorithm === "o200k_base" ||
        algorithm === "cl100k_base" ||
        algorithm === "p50k_base" ||
        algorithm === "r50k_base"
    );
}

async function loadTiktokenRanks(
    algorithm: "o200k_base" | "cl100k_base" | "p50k_base" | "r50k_base",
): Promise<TiktokenRanks | undefined> {
    if (algorithm === "o200k_base")
        return (await import("js-tiktoken/ranks/o200k_base")).default as TiktokenRanks;
    if (algorithm === "cl100k_base")
        return (await import("js-tiktoken/ranks/cl100k_base")).default as TiktokenRanks;
    if (algorithm === "p50k_base")
        return (await import("js-tiktoken/ranks/p50k_base")).default as TiktokenRanks;
    return (await import("js-tiktoken/ranks/r50k_base")).default as TiktokenRanks;
}

function trimEncoderCache(active: TokenizerAlgorithm) {
    for (const [algorithm, encoder] of cachedEncoders) {
        if (cachedEncoders.size <= maxCachedEncoders) return;
        if (algorithm === active) continue;
        cachedEncoders.delete(algorithm);
    }
}

function utf8ByteLength(value: string) {
    return new TextEncoder().encode(value).length;
}
