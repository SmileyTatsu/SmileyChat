import { getCsrfTrustedOrigins, getHost } from "../config/runtime-config";
import { isPrivateNetworkHostname } from "../private-network";

const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function hostnameFromAuthority(authority: string): string | undefined {
    if (!authority || typeof authority !== "string") {
        return undefined;
    }

    const trimmed = authority.trim();
    if (!trimmed) {
        return undefined;
    }

    // Reject userinfo (@), paths (/ or \), query (?), fragment (#), comma-separated values, whitespace, and control characters
    if (/[@/\\?#,\s\x00-\x1f\x7f]/.test(trimmed)) {
        return undefined;
    }

    try {
        const url = new URL(`http://${trimmed}`);

        if (
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            return undefined;
        }

        const cleanHost = trimmed.toLowerCase();
        if (
            cleanHost !== url.host.toLowerCase() &&
            cleanHost !== `${url.hostname.toLowerCase()}:80`
        ) {
            return undefined;
        }

        return url.hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

export function isAllowedHost(hostname: string): boolean {
    const cleanHost = hostname.toLowerCase().trim();

    if (!cleanHost) {
        return false;
    }

    if (loopbackHostnames.has(cleanHost)) {
        return true;
    }

    if (isPrivateNetworkHostname(cleanHost)) {
        return true;
    }

    const configuredOrigins = getCsrfTrustedOrigins();
    for (const origin of configuredOrigins) {
        try {
            const parsed = new URL(origin).hostname.toLowerCase();
            if (parsed === cleanHost) {
                return true;
            }
        } catch {
            // ignore invalid configured origin
        }
    }

    const configuredHost = getHost().toLowerCase().trim();
    if (
        configuredHost &&
        configuredHost !== "0.0.0.0" &&
        configuredHost !== "::" &&
        configuredHost === cleanHost
    ) {
        return true;
    }

    return false;
}
