/**
 * Display helpers for the model picker `meta` column.
 * Pure and dependency-free so both the catalog field and the OpenRouter panel
 * format their rows the same way.
 */

const tokensPerMillion = 1_000_000;

/** Compact context-window label: 128000 -> "128k", 1048576 -> "1.05M". */
export function formatContextTokens(
    contextTokens: number | null | undefined,
): string | undefined {
    if (
        typeof contextTokens !== "number" ||
        !Number.isFinite(contextTokens) ||
        contextTokens <= 0
    ) {
        return undefined;
    }

    if (contextTokens >= tokensPerMillion) {
        return `${trimDecimals(contextTokens / tokensPerMillion, 2)}M`;
    }

    if (contextTokens >= 1_000) {
        return `${Math.round(contextTokens / 1_000)}k`;
    }

    return String(Math.round(contextTokens));
}

/**
 * Prompt price label from an OpenRouter-style USD-per-token string or number:
 * 0.000003 -> "$3/M", 0 -> "free". Returns undefined for unusable input.
 */
export function formatPricePerMillion(
    promptPricePerToken: string | number | null | undefined,
): string | undefined {
    if (promptPricePerToken === null || promptPricePerToken === undefined) {
        return undefined;
    }

    const price =
        typeof promptPricePerToken === "number"
            ? promptPricePerToken
            : Number.parseFloat(promptPricePerToken.trim());

    if (!Number.isFinite(price) || price < 0) {
        return undefined;
    }

    if (price === 0) {
        return "free";
    }

    const usdPerMillion = price * tokensPerMillion;
    const decimals = usdPerMillion >= 1 ? 2 : 3;
    const rounded = Number(usdPerMillion.toFixed(decimals));

    return rounded === 0 ? "<$0.001/M" : `$${rounded}/M`;
}

function trimDecimals(value: number, decimals: number) {
    return String(Number(value.toFixed(decimals)));
}
