export function formatDuration(ms: number): string {
    const safeMs = Math.max(0, Math.round(ms));

    if (safeMs < 1_000) return `${safeMs}ms`;

    const totalSeconds = safeMs / 1_000;
    if (totalSeconds < 60) {
        const roundedSeconds = Math.round(totalSeconds * 10) / 10;
        return `${Number.isInteger(roundedSeconds) ? roundedSeconds : roundedSeconds.toFixed(1)}s`;
    }

    const wholeSeconds = Math.floor(totalSeconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const seconds = wholeSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
