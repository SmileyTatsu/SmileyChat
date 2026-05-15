// Fixed-window per-IP rate limiter for /api/*.
//
// Default bucket: 600 req/min per IP across the whole API surface (every
// request a normal user makes goes through React Query, which doesn't
// generate anywhere near that volume). A handful of routes get tighter
// buckets to throttle the dangerous corners: bulk-import, avatar upload,
// CSRF-token grab, etc.
//
// Bucket sweep runs once per minute (on the first request after a 60 s
// gap), which keeps the map small without a dedicated timer.

import { getDefaultRateLimit, isRateLimitEnabled } from "../config/runtime-config";

type Bucket = { count: number; resetAt: number };

interface RateLimitRule {
    key: string;
    limit: number;
    windowMs: number;
}

const ROUTE_RULES: Array<{ pattern: RegExp; rule: RateLimitRule }> = [
    {
        pattern: /^\/api\/csrf(?:$|\?)/,
        rule: { key: "csrf-token", limit: 60, windowMs: 60_000 },
    },
    {
        pattern: /^\/api\/(characters|chats|personas)\/import(?:$|\?|\/)/,
        rule: { key: "import", limit: 20, windowMs: 60_000 },
    },
    {
        pattern: /^\/api\/(characters|personas)\/[^/]+\/avatar(?:$|\?)/,
        rule: { key: "avatar-upload", limit: 30, windowMs: 60_000 },
    },
    {
        pattern: /^\/api\/characters\/[^/]+\/export\.png(?:$|\?)/,
        rule: { key: "card-export", limit: 30, windowMs: 60_000 },
    },
    {
        pattern: /^\/api\/connections\/secrets(?:$|\?)/,
        rule: { key: "secrets", limit: 120, windowMs: 60_000 },
    },
];

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

function defaultRule(): RateLimitRule {
    return { key: "default", limit: getDefaultRateLimit(), windowMs: 60_000 };
}

function selectRule(pathname: string): RateLimitRule {
    return ROUTE_RULES.find((entry) => entry.pattern.test(pathname))?.rule ?? defaultRule();
}

function sweepExpired(now: number) {
    if (now - lastSweepAt < 60_000) return;
    lastSweepAt = now;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export interface RateLimitResult {
    limit: number;
    remaining: number;
    resetAt: number;
    exceeded: boolean;
}

// Returns null when rate limiting is disabled or the request isn't /api/*.
// Otherwise returns a result the caller can use to set headers and
// optionally short-circuit with 429.
export function checkRateLimit(url: URL, ip: string): RateLimitResult | null {
    if (!isRateLimitEnabled()) return null;
    if (!url.pathname.startsWith("/api/")) return null;

    const now = Date.now();
    sweepExpired(now);

    const rule = selectRule(url.pathname);
    const key = `${rule.key}:${ip}`;
    const existing = buckets.get(key);
    const bucket =
        existing && existing.resetAt > now
            ? existing
            : { count: 0, resetAt: now + rule.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    return {
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - bucket.count),
        resetAt: bucket.resetAt,
        exceeded: bucket.count > rule.limit,
    };
}

export function buildRateLimitedResponse(result: RateLimitResult): Response {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return new Response(
        JSON.stringify({ error: "Too many requests.", code: "rate_limited" }),
        {
            status: 429,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Retry-After": String(retryAfter),
                "RateLimit-Limit": String(result.limit),
                "RateLimit-Remaining": "0",
                "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
            },
        },
    );
}

export function applyRateLimitHeaders(response: Response, result: RateLimitResult): Response {
    response.headers.set("RateLimit-Limit", String(result.limit));
    response.headers.set("RateLimit-Remaining", String(result.remaining));
    response.headers.set("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
    return response;
}

export function resetRateLimitBucketsForTests() {
    buckets.clear();
    lastSweepAt = 0;
}
