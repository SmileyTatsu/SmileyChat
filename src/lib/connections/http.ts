export function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

export async function safeResponseText(response: Response, limit = 4000) {
    try {
        return (await response.text()).slice(0, limit);
    } catch {
        return "";
    }
}

export async function fetchProviderApi<T>(
    url: string,
    {
        errorPrefix,
        displayUrl,
        ...init
    }: RequestInit & {
        errorPrefix: string;
        displayUrl?: string;
    },
): Promise<T> {
    const response = await fetch(url, init);

    if (!response.ok) {
        throw new Error(
            `${errorPrefix}${displayUrl ? ` at ${displayUrl}` : ""}: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    return (await response.json()) as T;
}
