export function messageFromError(error: unknown, fallback = "Unexpected error.") {
    return error instanceof Error ? error.message : fallback;
}
