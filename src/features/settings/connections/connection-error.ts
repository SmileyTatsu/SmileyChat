import { messageFromError } from "#frontend/lib/common/errors";

function isPrivateIPv4(hostname: string): boolean {
    const octets = hostname.split(".").map(Number);

    if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
        return false;
    }

    return (
        octets.every((octet) => octet === 0) ||
        octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
    );
}

export function isLocalEndpoint(targetUrl?: string): boolean {
    if (!targetUrl) return false;

    try {
        const hostname = new URL(targetUrl).hostname
            .toLowerCase()
            .replace(/^\[|\]$/g, "");

        const isLocalIPv6 =
            hostname.includes(":") &&
            (hostname === "::1" ||
                hostname.startsWith("fc") ||
                hostname.startsWith("fd") ||
                hostname.startsWith("fe80:"));

        return (
            hostname === "localhost" ||
            hostname.endsWith(".localhost") ||
            hostname.endsWith(".local") ||
            isLocalIPv6 ||
            isPrivateIPv4(hostname)
        );
    } catch {
        return false;
    }
}

export function formatConnectionError(error: unknown, targetUrl?: string): string {
    const raw = messageFromError(error, "Unexpected connection error.");
    const isNetworkError =
        /failed to fetch|fetch failed|network\s?error|load failed|econnrefused/i.test(
            raw,
        );

    if (isNetworkError && isLocalEndpoint(targetUrl)) {
        return `${raw}: Could not reach local endpoint at ${targetUrl}. Ensure the local server is running and configured for browser access (e.g. for Ollama set OLLAMA_ORIGINS="*", or allow CORS in LM Studio).`;
    }

    return raw;
}
