export const defaultContextTokenBudget = 16000;
export const maxContextTokenBudget = 200000;
export const minContextTokenBudget = 0;
export const contextTokenBudgetRangeStep = 1024;
export const maxContextTokenBudgetRangeValue =
    Math.ceil(maxContextTokenBudget / contextTokenBudgetRangeStep) *
    contextTokenBudgetRangeStep;

export function normalizeContextTokenBudget(
    value: unknown,
    fallback = defaultContextTokenBudget,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(
        maxContextTokenBudget,
        Math.max(minContextTokenBudget, Math.round(value)),
    );
}

export function contextTokenBudgetToRangeValue(value: number) {
    if (value >= maxContextTokenBudget) {
        return maxContextTokenBudgetRangeValue;
    }

    return Math.min(
        maxContextTokenBudgetRangeValue,
        Math.max(
            minContextTokenBudget,
            Math.round(value / contextTokenBudgetRangeStep) *
                contextTokenBudgetRangeStep,
        ),
    );
}
