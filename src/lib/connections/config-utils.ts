export function stringOrUndefined(value: unknown) {
    return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeStringList(value: unknown): string[] {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return normalizeStringList(parsed);
                }
            } catch {
                // Ignore parse errors, fallback
            }
        }
        if (trimmed.includes("\n")) {
            return normalizeStringList(trimmed.split("\n"));
        }
        if (value.length > 0) {
            return [value];
        }
        return [];
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .map((item) => (typeof item === "string" ? item : String(item ?? "")))
                .filter((item) => item.length > 0),
        ),
    );
}
