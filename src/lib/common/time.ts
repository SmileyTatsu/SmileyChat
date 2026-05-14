export function formatDate(date = new Date()) {
    return date.toLocaleDateString();
}

export function formatShortTime(date = new Date()) {
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatDateTime(date = new Date()) {
    return `${formatDate(date)} ${formatShortTime(date)}`;
}
