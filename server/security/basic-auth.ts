// HTTP Basic Auth + safe-by-default lockdown.
//
// When SMILEYCHAT_BASIC_AUTH_USER and SMILEYCHAT_BASIC_AUTH_PASS are set,
// every non-loopback, non-allowlisted request must carry a matching
// `Authorization: Basic …` header.
//
// When credentials are NOT configured, the lockdown refuses connections
// from every non-loopback IP unless the operator explicitly opts in via
// SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK / _REMOTE. This is the
// fail-closed safety net for users who flip SMILEYCHAT_HOST to 0.0.0.0
// without thinking about auth.

import { timingSafeEqual } from "node:crypto";

import {
    getBasicAuthConfig,
    isUnauthenticatedPrivateNetworkAllowed,
    isUnauthenticatedRemoteAllowed,
} from "../config/runtime-config";

import {
    isInIpAllowlist,
    isLoopbackIp,
    isPrivateNetworkIp,
    isTrustedInterfaceIp,
} from "./ip-allowlist";
import { renderLockdownPage } from "./lockdown-page";

interface ResolvedConfig {
    user: string;
    pass: string;
    realm: string;
    expectedHeader: Buffer;
}

let cached: {
    raw: { user: string | null; pass: string | null; realm: string };
    resolved: ResolvedConfig | null;
    announced: boolean;
} | null = null;

function buildExpectedHeader(user: string, pass: string): Buffer {
    return Buffer.from(
        `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`,
        "utf8",
    );
}

function loadConfig(): ResolvedConfig | null {
    const raw = getBasicAuthConfig();
    if (
        !cached ||
        cached.raw.user !== raw.user ||
        cached.raw.pass !== raw.pass ||
        cached.raw.realm !== raw.realm
    ) {
        if (raw.user && raw.pass) {
            cached = {
                raw,
                resolved: {
                    user: raw.user,
                    pass: raw.pass,
                    realm: raw.realm,
                    expectedHeader: buildExpectedHeader(raw.user, raw.pass),
                },
                announced: false,
            };
        } else {
            cached = { raw, resolved: null, announced: false };
        }
    }

    if (cached.resolved && !cached.announced) {
        console.log(
            `[basic-auth] HTTP Basic Auth enabled (realm="${cached.resolved.realm}", user="${cached.resolved.user}")`,
        );
        cached.announced = true;
    }

    return cached.resolved;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function isHealthEndpoint(url: URL): boolean {
    return url.pathname === "/api/health";
}

function isCsrfEndpoint(url: URL): boolean {
    return url.pathname === "/api/csrf";
}

function wantsHtml(request: Request, url: URL): boolean {
    if (url.pathname.startsWith("/api/")) return false;
    const accept = request.headers.get("accept");
    return typeof accept === "string" && accept.toLowerCase().includes("text/html");
}

function buildChallengeResponse(realm: string): Response {
    const safeRealm = realm.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return new Response(
        JSON.stringify({ error: "Authentication required", code: "basic_auth_required" }),
        {
            status: 401,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "WWW-Authenticate": `Basic realm="${safeRealm}", charset="UTF-8"`,
            },
        },
    );
}

const LOCKDOWN_JSON_MESSAGE =
    "Non-loopback access requires authentication because no Basic Auth credentials are configured. " +
    "Set SMILEYCHAT_BASIC_AUTH_USER and SMILEYCHAT_BASIC_AUTH_PASS, add this IP to SMILEYCHAT_IP_ALLOWLIST, " +
    "or explicitly opt in with SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true for LAN clients. " +
    "Set SMILEYCHAT_ALLOW_UNAUTHENTICATED_REMOTE=true only if unauthenticated public access is intentional.";

function buildLockdownResponse(request: Request, url: URL, ip: string): Response {
    if (wantsHtml(request, url)) {
        return new Response(renderLockdownPage(ip), {
            status: 403,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }
    return new Response(
        JSON.stringify({
            error: "Forbidden",
            code: "remote_access_locked",
            message: LOCKDOWN_JSON_MESSAGE,
        }),
        {
            status: 403,
            headers: { "Content-Type": "application/json; charset=utf-8" },
        },
    );
}

let lockdownAnnounced = false;

// Returns null to continue, or a Response to short-circuit the request.
export function checkBasicAuth(request: Request, url: URL, ip: string): Response | null {
    if (isHealthEndpoint(url)) return null;
    // /api/csrf is exempted so the frontend can fetch a token before the
    // browser surfaces a Basic Auth prompt. The token request itself is
    // still origin-gated by csrf.ts.
    if (isCsrfEndpoint(url)) return null;

    if (isLoopbackIp(ip) || isInIpAllowlist(ip) || isTrustedInterfaceIp(ip)) {
        return null;
    }

    const config = loadConfig();

    if (!config) {
        if (isPrivateNetworkIp(ip) && isUnauthenticatedPrivateNetworkAllowed()) return null;
        if (isUnauthenticatedRemoteAllowed()) return null;
        if (!lockdownAnnounced) {
            console.warn(
                `[basic-auth] Refused non-loopback connection from ${ip}. No auth configured; set SMILEYCHAT_BASIC_AUTH_USER/PASS, SMILEYCHAT_IP_ALLOWLIST, or SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK/REMOTE.`,
            );
            lockdownAnnounced = true;
        }
        return buildLockdownResponse(request, url, ip);
    }

    const header = request.headers.get("authorization");
    if (!header) return buildChallengeResponse(config.realm);

    const provided = Buffer.from(header, "utf8");
    if (!safeEqual(provided, config.expectedHeader)) {
        return buildChallengeResponse(config.realm);
    }

    return null;
}

export function hasBasicAuthConfigured(): boolean {
    return loadConfig() !== null;
}

export function isBasicAuthSatisfied(request: Request, ip: string): boolean {
    if (isLoopbackIp(ip) || isInIpAllowlist(ip) || isTrustedInterfaceIp(ip)) return true;

    const config = loadConfig();
    if (!config) {
        if (isPrivateNetworkIp(ip) && isUnauthenticatedPrivateNetworkAllowed()) return true;
        return isUnauthenticatedRemoteAllowed();
    }

    const header = request.headers.get("authorization");
    if (!header) return false;
    return safeEqual(Buffer.from(header, "utf8"), config.expectedHeader);
}
