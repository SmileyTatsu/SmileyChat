import type { ConnectionProviderId } from "../connections/config";
import type { TokenizerAlgorithm } from "./types";

export function detectTokenizerAlgorithm(
    provider: ConnectionProviderId,
    modelId: string,
): TokenizerAlgorithm {
    const model = modelId.trim().toLowerCase();

    if (provider === "anthropic") return "heuristic";
    if (provider === "google-ai") return "gemma";
    if (provider === "novelai") return "nerdstash";

    if (/^(gpt-5|gpt-4\.1|gpt-4o|chatgpt-4o|o[1-4]-)/.test(model)) {
        return "o200k_base";
    }
    if (/^(gpt-4|gpt-3\.5|gpt-35|text-embedding-3|babbage-002|davinci-002)/.test(model)) {
        return "cl100k_base";
    }
    if (/(^|[/:_-])deepseek([/:_-]|$)/.test(model)) return "deepseek";
    if (/(^|[/:_-])llama[- ]?3/.test(model)) return "llama3";
    if (/(^|[/:_-])llama[- ]?2/.test(model)) return "llama2";
    if (/mistral|mixtral|pixtral/.test(model)) return "mistral";
    if (/(^|[/:_-])yi([/:_-]|$)/.test(model)) return "yi";
    if (/gemma/.test(model)) return "gemma";

    return "heuristic";
}
