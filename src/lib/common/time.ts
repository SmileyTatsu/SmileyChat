export function formatDate(date = new Date()) {
    return date.toLocaleDateString();
}

export function formatShortTime(date: string | Date = new Date()) {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(date = new Date()) {
    return `${formatDate(date)} ${formatShortTime(date)}`;
}
