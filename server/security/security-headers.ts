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
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
].join("; ");

export function applySecurityHeaders(response: Response, pathname: string): Response {
    for (const [name, value] of Object.entries(STATIC_HEADERS)) {
        if (!response.headers.has(name)) response.headers.set(name, value);
    }
    if (!response.headers.has("Permissions-Policy")) {
        response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
    }
    if (!response.headers.has("Content-Security-Policy")) {
        response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    if (pathname.startsWith("/api/") && !response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "no-store");
    }
    return response;
}
