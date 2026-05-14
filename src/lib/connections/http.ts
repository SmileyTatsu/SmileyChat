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
