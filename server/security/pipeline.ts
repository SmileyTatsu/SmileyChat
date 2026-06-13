// Orchestrates the security pipeline for a single incoming request.
//
// Bun.serve doesn't have a multi-stage middleware chain like Fastify, so
// we run all the gates here in order and return either a short-circuit
// Response or null + the pieces (IP, rate-limit headers) the caller needs
// to finish the request.
//
// Order is: IP allowlist → Rate limit → Basic Auth. CSRF runs separately,
// in server/csrf.ts (gated on unsafe methods + /api/* only), so it stays
// alongside the existing token-issuance logic.

import { checkBasicAuth } from "./basic-auth";
import { getTrustedProxyCidrs } from "../config/runtime-config";
import {
    checkIpAllowlist,
    ipToBytes,
    matchesCidr,
    parseCidr,
    type CidrEntry,
} from "./ip-allowlist";
import {
    applyRateLimitHeaders,
    buildRateLimitedResponse,
    checkRateLimit,
    type RateLimitResult,
} from "./rate-limit";
import { applySecurityHeaders } from "./security-headers";

export interface SecurityContext {
    ip: string;
    url: URL;
    rateLimit: RateLimitResult | null;
}

let cachedTrustedProxies: {
    raw: string | null;
    entries: CidrEntry[] | null;
} | null = null;

function getTrustedProxies(): CidrEntry[] | null {
    const raw = getTrustedProxyCidrs();
    if (!cachedTrustedProxies || cachedTrustedProxies.raw !== raw) {
        const entries: CidrEntry[] = [];
        if (raw) {
            for (const part of raw.split(",")) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                const cidr = parseCidr(trimmed);
                if (!cidr) {
                    console.warn(
                        `[trusted-proxies] Ignoring invalid entry: "${trimmed}"`,
                    );
                    continue;
                }
                entries.push(cidr);
            }
        }

        cachedTrustedProxies = {
            raw,
            entries: entries.length > 0 ? entries : null,
        };
    }

    return cachedTrustedProxies.entries;
}

function isTrustedProxyIp(ip: string): boolean {
    const trustedProxies = getTrustedProxies();
    if (!trustedProxies) return false;

    const bytes = ipToBytes(ip);
    if (!bytes) return false;

    return trustedProxies.some((entry) => matchesCidr(bytes, entry));
}

function firstForwardedForIp(request: Request): string | null {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (!forwardedFor) return null;

    const first = forwardedFor.split(",")[0]?.trim();
    return first && ipToBytes(first) ? first : null;
}

export function resolveClientIp(request: Request, server: Bun.Server<unknown>): string {
    const sockAddr = server.requestIP(request);
    if (sockAddr?.address) {
        if (isTrustedProxyIp(sockAddr.address)) {
            return firstForwardedForIp(request) ?? sockAddr.address;
        }
        return sockAddr.address;
    }

    return "0.0.0.0";
}

// Runs the request through every security gate. Returns either:
//   - a Response (= the request is rejected; return it as-is, headers already applied)
//   - a SecurityContext (= continue to the route handler / static)
export function runSecurityPipeline(
    request: Request,
    server: Bun.Server<unknown>,
): Response | SecurityContext {
    const url = new URL(request.url);
    const ip = resolveClientIp(request, server);

    // IP allowlist runs first so blocked IPs never reach auth/rate limit.
    const allowlistResult = checkIpAllowlist(ip);
    if (allowlistResult === false) {
        return finalize(
            new Response(
                JSON.stringify({ error: "Forbidden.", code: "ip_not_allowlisted" }),
                {
                    status: 403,
                    headers: { "Content-Type": "application/json; charset=utf-8" },
                },
            ),
            url,
        );
    }

    const rateLimit = checkRateLimit(url, ip);
    if (rateLimit?.exceeded) {
        return finalize(buildRateLimitedResponse(rateLimit), url);
    }

    const authRejection = checkBasicAuth(request, url, ip);
    if (authRejection) return finalize(authRejection, url);

    return { ip, url, rateLimit };
}

// Apply outgoing-response decoration (security headers, optional rate
// limit headers). Called once per request at the very end, after the
// route handler has produced its Response.
export function finalize(
    response: Response,
    url: URL,
    rateLimit: RateLimitResult | null = null,
): Response {
    if (rateLimit) applyRateLimitHeaders(response, rateLimit);
    return applySecurityHeaders(response, url.pathname);
}
