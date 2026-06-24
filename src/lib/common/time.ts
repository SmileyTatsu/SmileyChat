export function formatDate(date = new Date()) {
    return date.toLocaleDateString();
}

export function formatShortTime(
    date: string | Date = new Date(),
    format: "12h" | "24h" = "12h",
) {
    return new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: format === "12h",
    });
}

export function formatDateTime(date = new Date()) {
    return `${formatDate(date)} ${formatShortTime(date)}`;
}
