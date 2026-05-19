export function stringOrUndefined(value: unknown) {
    return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeStringList(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter(Boolean),
        ),
    );
}
