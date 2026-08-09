import type { ConnectionProviderId, ConnectionProfile } from "../connections/config";

export const tokenizerAlgorithms = [
    "auto",
    "o200k_base",
    "cl100k_base",
    "p50k_base",
    "r50k_base",
    "llama3",
    "llama2",
    "mistral",
    "yi",
    "gemma",
    "deepseek",
    "nerdstash",
    "heuristic",
] as const;

export type TokenizerAlgorithm = (typeof tokenizerAlgorithms)[number];

export type TokenizerSelection = {
    mode: "auto" | "manual";
    algorithm?: Exclude<TokenizerAlgorithm, "auto">;
};

export type TokenCountContext = {
    provider: ConnectionProviderId;
    modelId: string;
    selection: TokenizerSelection;
};

export type LocalTokenCount = {
    algorithm: TokenizerAlgorithm;
    exact: boolean;
    tokens: number;
};

export type TokenizerProfile = Pick<
    ConnectionProfile,
    "provider" | "tokenizer" | "config"
>;
