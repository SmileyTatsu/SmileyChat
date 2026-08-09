import type { TokenCountContext } from "../tokenizer";

/**
 * Local protocol estimates deliberately stay conservative. Providers are free
 * to change internal serialization, so this is a budgeting policy rather than
 * a claim of billable usage.
 */
export function providerTokenPolicy(context?: TokenCountContext) {
    switch (context?.provider) {
        case "anthropic":
            return { messageOverhead: 3, safetyMargin: 1536 };
        case "google-ai":
            return { messageOverhead: 2, safetyMargin: 1536 };
        case "novelai":
            return { messageOverhead: 2, safetyMargin: 1536 };
        case "openrouter":
            return { messageOverhead: 4, safetyMargin: 1536 };
        case "openai-compatible":
        case "xai":
            return { messageOverhead: 4, safetyMargin: 1024 };
        default:
            return { messageOverhead: 4, safetyMargin: 2048 };
    }
}
