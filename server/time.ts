export function timestampMs(value: string) {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : 0;
}
