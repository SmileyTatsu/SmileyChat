export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && !Array.isArray(value);
}

export function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

export function booleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}
