export function clampNumber(
    value: unknown,
    min: number,
    max: number,
    fallback = min,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, value));
}

export function clampInteger(
    value: unknown,
    min: number,
    max: number,
    fallback = min,
) {
    return Math.round(clampNumber(value, min, max, fallback));
}
