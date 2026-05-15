// SSRF-safe outbound fetch wrapper. SmileyChat's server has no built-in
// outbound endpoints today (LLM calls go browser → provider directly), but
// plugins that opt into outbound fetch via SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH
// should funnel through this helper instead of raw `fetch` so they can't
// be tricked into fetching loopback / RFC 1918 / metadata / reserved
// addresses via a user-supplied URL or a 302 redirect.
//
// Validation order:
//   1. Protocol must be in `allowedProtocols` (default: https only).
//   2. Hostname must not be a literal loopback / .localhost / .local / .internal
//      name unless explicitly enabled.
//   3. Resolve the hostname with `dns.lookup({all:true, verbatim:true})` and
//      reject if any resolved IP is in the loopback, private, link-local,
//      CGNAT, or RFC-reserved sets unless explicitly enabled.
//   4. Each redirect re-runs the full validation chain.

import { promises as dns } from "node:dns";

import {
    isLoopbackIp,
    isPrivateNetworkIp,
    ipToBytes,
    matchesCidr,
    parseCidr,
    type CidrEntry,
} from "./ip-allowlist";

const RESERVED_CIDRS: CidrEntry[] = [
    "0.0.0.0/8",
    "192.0.0.0/24",
    "192.0.2.0/24",
    "198.18.0.0/15",
    "198.51.100.0/24",
    "203.0.113.0/24",
    "224.0.0.0/4",
    "240.0.0.0/4",
    "::/128",
    "::1/128",
    "64:ff9b::/96",
    "100::/64",
    "2001:db8::/32",
]
    .map((entry) => parseCidr(entry))
    .filter((entry): entry is CidrEntry => entry !== null);

const LOCALHOST_NAMES = new Set([
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
]);
const RESERVED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

export interface SafeFetchPolicy {
    allowLocal?: boolean;
    allowLoopback?: boolean;
    allowMdns?: boolean;
    allowedProtocols?: string[];
    maxRedirects?: number;
    /** Name of the env var the user would flip to allow this fetch. Surfaced in errors. */
    flagName?: string;
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
    policy?: SafeFetchPolicy;
    maxResponseBytes?: number;
}

function unbracket(hostname: string): string {
    return hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
}

function isReservedIp(ip: string): boolean {
    if (isLoopbackIp(ip) || isPrivateNetworkIp(ip)) return true;
    const bytes = ipToBytes(ip);
    if (!bytes) return true;
    return RESERVED_CIDRS.some((cidr) => matchesCidr(bytes, cidr));
}

function isIpLiteral(hostname: string): boolean {
    return ipToBytes(unbracket(hostname)) !== null;
}

function isLocalHostname(hostname: string): boolean {
    const lower = unbracket(hostname).replace(/\.$/, "").toLowerCase();
    return (
        LOCALHOST_NAMES.has(lower) ||
        RESERVED_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix))
    );
}

function isMdnsHostname(hostname: string): boolean {
    return unbracket(hostname).replace(/\.$/, "").toLowerCase().endsWith(".local");
}

function flagHint(policy: SafeFetchPolicy): string {
    if (!policy.flagName) return "";
    return ` Set ${policy.flagName}=true in your .env to allow this (changes take effect within ~2s without a restart).`;
}

async function resolveHostname(
    hostname: string,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
    const bare = unbracket(hostname);
    if (isIpLiteral(bare)) {
        return [{ address: bare, family: bare.includes(":") ? 6 : 4 }];
    }
    const records = await dns.lookup(bare, { all: true, verbatim: true });
    return records.flatMap((record) =>
        record.family === 4 || record.family === 6
            ? [{ address: record.address, family: record.family }]
            : [],
    );
}

function describeBlockedAddresses(
    addresses: Array<{ address: string }>,
    policy: SafeFetchPolicy,
): string {
    const blocked = addresses
        .filter((entry) => isReservedIp(entry.address))
        .filter((entry) => !(policy.allowLoopback && isLoopbackIp(entry.address)))
        .map((entry) => entry.address);
    return blocked.length === 0 ? "" : ` (resolved to ${blocked.join(", ")})`;
}

async function validateUrl(rawUrl: string | URL, policy: SafeFetchPolicy): Promise<URL> {
    const parsed = typeof rawUrl === "string" ? new URL(rawUrl) : new URL(rawUrl.toString());
    const original = typeof rawUrl === "string" ? rawUrl : parsed.toString();
    const allowedProtocols = policy.allowedProtocols ?? ["https:"];

    if (!allowedProtocols.includes(parsed.protocol)) {
        throw new Error(
            `Refused to fetch ${original}: protocol '${parsed.protocol.replace(/:$/, "")}' is not allowed (allowed: ${allowedProtocols.map((proto) => proto.replace(/:$/, "")).join(", ")}).`,
        );
    }

    if (policy.allowLocal) {
        return parsed;
    }

    if (
        isLocalHostname(parsed.hostname) &&
        !(policy.allowLoopback && (LOCALHOST_NAMES.has(parsed.hostname.toLowerCase()) || isLoopbackIp(parsed.hostname))) &&
        !(policy.allowMdns && isMdnsHostname(parsed.hostname))
    ) {
        throw new Error(
            `Refused to fetch ${original}: hostname '${parsed.hostname}' is local or reserved.${flagHint(policy)}`,
        );
    }

    const addresses = await resolveHostname(parsed.hostname);
    if (addresses.length === 0) {
        throw new Error(
            `Refused to fetch ${original}: hostname '${parsed.hostname}' did not resolve to any address.`,
        );
    }

    const blocked = addresses
        .filter((entry) => isReservedIp(entry.address))
        .filter((entry) => !(policy.allowLoopback && isLoopbackIp(entry.address)));
    if (blocked.length > 0) {
        throw new Error(
            `Refused to fetch ${original}: '${parsed.hostname}'${describeBlockedAddresses(addresses, policy)} is in a private, loopback, metadata, or reserved IP range.${flagHint(policy)}`,
        );
    }

    return parsed;
}

export async function validateOutboundUrl(
    url: string | URL,
    policy: SafeFetchPolicy = {},
): Promise<URL> {
    return validateUrl(url, policy);
}

export async function safeFetch(
    url: string | URL,
    options: SafeFetchOptions = {},
): Promise<Response> {
    const { policy = {}, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES, ...init } = options;
    const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    let current = await validateUrl(url, policy);

    for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
        const response = await fetch(current, { ...init, redirect: "manual" });
        if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.has("location")
        ) {
            if (attempt === maxRedirects) {
                throw new Error("Outbound request exceeded redirect limit.");
            }
            const nextUrl = new URL(response.headers.get("location")!, current);
            current = await validateUrl(nextUrl, policy);
            continue;
        }

        const contentLength = Number(response.headers.get("content-length") ?? "");
        if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
            await response.body?.cancel().catch(() => undefined);
            throw new Error(
                `Outbound response exceeded ${maxResponseBytes} bytes (Content-Length=${contentLength}).`,
            );
        }

        return response;
    }

    throw new Error("Outbound request exceeded redirect limit.");
}
