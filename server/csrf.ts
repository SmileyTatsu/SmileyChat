import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { getCsrfTrustedOrigins, getFrontendPort } from "./config/runtime-config";
import { HttpError, writeJsonAtomic } from "./http";
import { csrfSecretPath } from "./paths";
import { isPrivateNetworkHostname } from "./private-network";

const csrfTokenHeader = "x-smileychat-csrf";
// Magic header that confirms a request was issued by code aware of the
// SmileyChat API (i.e. our frontend or a script that read the docs). Stops
// the simplest "anyone can forge a same-origin POST from a script tag"
// class of CSRF without depending only on Origin/Referer parsing.
const csrfMagicHeader = "x-smileychat-csrf-magic";
const csrfMagicValue = "1";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const defaultTrustedOriginHosts = ["localhost", "127.0.0.1", "[::1]"];

const MAX_ANNOUNCED_REJECTED_ORIGINS = 2048;
const announcedRejectedOrigins = new Set<string>();
function announceRejectedOrigin(kind: "Origin" | "Referer", value: string, hint: string) {
    const key = `${kind}:${value}`;
    if (announcedRejectedOrigins.has(key)) return;
    if (announcedRejectedOrigins.size >= MAX_ANNOUNCED_REJECTED_ORIGINS) {
        const oldest = announcedRejectedOrigins.values().next().value;
        if (oldest !== undefined) announcedRejectedOrigins.delete(oldest);
    }
    announcedRejectedOrigins.add(key);
    console.warn(`[csrf] Rejected request: ${kind} '${value}' is not in the trusted list. ${hint}`);
}

type CsrfSecretFile = {
    version: number;
    secret: string;
};

let secretPromise: Promise<string> | undefined;

export class CsrfError extends HttpError {
    constructor(
        public code: string,
        message: string,
    ) {
        super(403, message);
        this.name = "CsrfError";
    }
}

export async function createCsrfToken() {
    return Bun.CSRF.generate(await readCsrfSecret());
}

export async function verifyCsrfRequest(request: Request) {
    if (!unsafeMethods.has(request.method)) {
        return;
    }

    verifyRequestOrigin(request);
    verifyMagicHeader(request);

    const token = request.headers.get(csrfTokenHeader);

    if (!token || !Bun.CSRF.verify(token, { secret: await readCsrfSecret() })) {
        throw new CsrfError("csrf_token_invalid", "Invalid CSRF token.");
    }
}

function verifyMagicHeader(request: Request) {
    const provided = request.headers.get(csrfMagicHeader);
    if (provided === csrfMagicValue) return;
    throw new CsrfError(
        "csrf_magic_header_missing",
        `Missing ${csrfMagicHeader} header. SmileyChat's frontend sends this automatically; scripts should set ${csrfMagicHeader}: ${csrfMagicValue}.`,
    );
}

function verifyRequestOrigin(request: Request) {
    const originHeader = request.headers.get("origin");
    const refererHeader = request.headers.get("referer");

    const provenanceOrigin =
        normalizeOrigin(originHeader) ?? normalizeRefererOrigin(refererHeader);

    if (!provenanceOrigin) {
        throw new CsrfError(
            "csrf_origin_missing",
            "Missing Origin or Referer header for unsafe request.",
        );
    }

    const allowedOriginsSet = getAllowedOrigins(request);
    if (!allowedOriginsSet.has(provenanceOrigin)) {
        const sourceHeader = originHeader ? "Origin" : "Referer";
        const sourceValue = originHeader ?? refererHeader ?? provenanceOrigin;
        announceRejectedOrigin(
            sourceHeader,
            sourceValue,
            `Add '${provenanceOrigin}' to SMILEYCHAT_TRUSTED_ORIGINS in your .env (comma-separated). No restart needed; takes effect within ~2s.`,
        );
        throw new CsrfError(
            "csrf_origin_untrusted",
            `Request origin "${provenanceOrigin}" is not trusted.`,
        );
    }
}

function getAllowedOrigins(request: Request) {
    return new Set([
        new URL(request.url).origin,
        ...forwardedRequestOrigins(request),
        ...privateNetworkRequestOrigins(request),
        ...trustedOriginsFromEnv(),
    ]);
}

function privateNetworkRequestOrigins(request: Request) {
    const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? "http";
    const host =
        firstHeaderValue(request.headers.get("x-forwarded-host")) ??
        firstHeaderValue(request.headers.get("host"));

    if (!host) {
        return [];
    }

    const hostname = hostnameFromAuthority(host);
    if (!hostname || !isPrivateNetworkHostname(hostname)) {
        return [];
    }

    const origin = normalizeOrigin(`${proto}://${host}`);
    return origin ? [origin] : [];
}

function hostnameFromAuthority(authority: string) {
    try {
        return new URL(`http://${authority}`).hostname;
    } catch {
        return undefined;
    }
}

function forwardedRequestOrigins(request: Request) {
    const proto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const host =
        firstHeaderValue(request.headers.get("x-forwarded-host")) ??
        firstHeaderValue(request.headers.get("host"));

    if (!proto || !host) {
        return [];
    }

    const forwardedOrigin = normalizeOrigin(`${proto}://${host}`);
    return forwardedOrigin ? [forwardedOrigin] : [];
}

function trustedOriginsFromEnv() {
    const configuredOrigins = getCsrfTrustedOrigins();
    const origins = configuredOrigins.length ? configuredOrigins : defaultTrustedOrigins();

    return origins
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value));
}

function defaultTrustedOrigins() {
    const frontendPort = getFrontendPort();
    return defaultTrustedOriginHosts.map((host) => `http://${host}:${frontendPort}`);
}

function normalizeRefererOrigin(value: string | null) {
    try {
        return value ? new URL(value).origin : undefined;
    } catch {
        return undefined;
    }
}

function normalizeOrigin(value: string | null) {
    if (!value) {
        return undefined;
    }

    try {
        return new URL(value).origin;
    } catch {
        return undefined;
    }
}

function firstHeaderValue(value: string | null) {
    return value?.split(",")[0]?.trim() || undefined;
}

async function readCsrfSecret() {
    if (process.env.SMILEYCHAT_CSRF_SECRET) {
        return process.env.SMILEYCHAT_CSRF_SECRET;
    }

    secretPromise ??= readOrCreateCsrfSecret();
    return secretPromise;
}

async function readOrCreateCsrfSecret() {
    if (await Bun.file(csrfSecretPath).exists()) {
        const saved = normalizeCsrfSecret(await Bun.file(csrfSecretPath).json());

        if (saved) {
            return saved;
        }
    }

    const secret = randomBytes(32).toString("base64url");
    const data: CsrfSecretFile = { version: 1, secret };

    await mkdir(dirname(csrfSecretPath), { recursive: true });
    await writeJsonAtomic(csrfSecretPath, data);

    return secret;
}

function normalizeCsrfSecret(value: unknown) {
    if (
        value &&
        typeof value === "object" &&
        "secret" in value &&
        typeof value.secret === "string" &&
        value.secret.length >= 32
    ) {
        return value.secret;
    }

    return undefined;
}
