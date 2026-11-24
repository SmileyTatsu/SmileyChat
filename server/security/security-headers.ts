import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { distDir } from "../paths";

// Security response headers applied to every outgoing response.
//
// CSP is tuned for SmileyChat's actual surface: the frontend bundles
// scripts and styles from `dist/`, plugin assets are served from
// /plugins/, and LLM provider calls go browser→provider directly so we
// need a permissive `connect-src` to keep that working. Everything else
// stays locked down.

const STATIC_HEADERS: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
};

const PERMISSIONS_POLICY = [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "serial=()",
    "xr-spatial-tracking=()",
].join(", ");

// Allow blob: in script-src so plugin ESM modules loaded via
// `URL.createObjectURL` (the standard pattern in src/lib/plugins/runtime.ts)
// keep working. connect-src is intentionally wide because all LLM provider
// calls happen browser→provider direct from arbitrary user-configured URLs.
export function contentSecurityPolicy(scriptHashes: string[] = inlineScriptHashes()) {
    const scriptSources = ["'self'", "blob:", ...scriptHashes].join(" ");

    return [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        `script-src ${scriptSources}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: http:",
        "media-src 'self' blob: data:",
        "font-src 'self' data:",
        "connect-src 'self' http: https: ws: wss:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ].join("; ");
}

const INLINE_SCRIPT_PATTERN = /<script\b[^>]*\btype="importmap"[^>]*>([\s\S]*?)<\/script>/i;

/**
 * CSP hashes for the inline scripts of the current build.
 *
 * The plugin import map is inline on purpose: an external one would be another
 * blocking request before the first module, and `src` import maps are still not
 * portable. But `script-src` without `'unsafe-inline'` blocks inline scripts —
 * import maps included — and the failure is silent, leaving every plugin unable
 * to resolve `preact`. Hashes keep the policy strict and still let the map
 * through, and reading them from the built HTML means the two cannot drift.
 */
export function inlineScriptHashesFor(html: string): string[] {
    const match = INLINE_SCRIPT_PATTERN.exec(html);

    if (!match) {
        return [];
    }

    const digest = createHash("sha256").update(match[1], "utf8").digest("base64");

    return [`'sha256-${digest}'`];
}

// Recomputed when the built page changes, so a rebuild served by a running
// process does not keep answering with the previous build's hash.
let inlineScriptCache: { stamp: string; hashes: string[] } | null = null;

function inlineScriptHashes(): string[] {
    try {
        const file = join(distDir, "index.html");
        const stat = statSync(file);
        const stamp = `${stat.mtimeMs}:${stat.size}`;

        if (inlineScriptCache?.stamp === stamp) {
            return inlineScriptCache.hashes;
        }

        const hashes = inlineScriptHashesFor(readFileSync(file, "utf8"));
        inlineScriptCache = { stamp, hashes };

        return hashes;
    } catch {
        return [];
    }
}

export function applySecurityHeaders(response: Response, pathname: string): Response {
    for (const [name, value] of Object.entries(STATIC_HEADERS)) {
        if (!response.headers.has(name)) response.headers.set(name, value);
    }
    if (!response.headers.has("Permissions-Policy")) {
        response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
    }
    if (!response.headers.has("Content-Security-Policy")) {
        response.headers.set("Content-Security-Policy", contentSecurityPolicy());
    }
    if (pathname.startsWith("/api/") && !response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "no-store");
    }
    return response;
}
