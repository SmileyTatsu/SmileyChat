type ContextMeterProps = {
    budget: number;
    usedTokens: number;
};

export function ContextMeter({ budget, usedTokens }: ContextMeterProps) {
    if (!budget) {
        return null;
    }

    const percent = Math.min(100, Math.round((usedTokens / budget) * 100));
    const state = percent >= 90 ? "critical" : percent >= 70 ? "warning" : "ok";

    return (
        <span
            className="composer-context-meter"
            data-state={state}
            title={`Chat history uses about ${formatTokens(usedTokens)} of the ${formatTokens(budget)} input tokens. Preset prompts, lorebooks and the author note share the same budget.`}
        >
            <span className="composer-context-track" aria-hidden="true">
                <span
                    className="composer-context-fill"
                    style={{ width: `${percent}%` }}
                />
            </span>
            <span className="composer-context-label">
                {formatTokens(usedTokens)} / {formatTokens(budget)}
            </span>
        </span>
    );
}

function formatTokens(value: number) {
    if (value >= 1_000_000) {
        return `${trimZero(value / 1_000_000)}m`;
    }

    if (value >= 1_000) {
        return `${trimZero(value / 1_000)}k`;
    }

    return `${Math.round(value)}`;
}

function trimZero(value: number) {
    return value >= 100 ? `${Math.round(value)}` : value.toFixed(1).replace(/\.0$/, "");
}
