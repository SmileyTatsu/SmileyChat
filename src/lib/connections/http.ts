export function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

export async function safeResponseText(response: Response) {
    try {
        return (await response.text()).slice(0, 500);
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
