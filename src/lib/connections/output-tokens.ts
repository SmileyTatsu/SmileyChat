export const defaultOutputTokenLimit = 1000;

export function normalizeOutputTokenLimit(
    value: unknown,
    minimum: number,
    fallback = defaultOutputTokenLimit,
) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        return fallback;
    }

    return Math.max(minimum, value);
}
