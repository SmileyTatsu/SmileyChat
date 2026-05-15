import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { HttpError, writeJsonAtomic } from "./http";
import { csrfSecretPath } from "./paths";

const csrfHeaderName = "x-smileychat-csrf";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

    const token = request.headers.get(csrfHeaderName);

    if (!token || !Bun.CSRF.verify(token, { secret: await readCsrfSecret() })) {
        throw new CsrfError("csrf_token_invalid", "Invalid CSRF token.");
    }
}

function verifyRequestOrigin(request: Request) {
    const provenanceOrigin =
        normalizeOrigin(request.headers.get("origin")) ??
        normalizeRefererOrigin(request.headers.get("referer"));

    if (!provenanceOrigin) {
        throw new CsrfError(
            "csrf_origin_missing",
            "Missing Origin or Referer header for unsafe request.",
        );
    }

    const allowedOriginSet = getAllowedOrigins(request);
    if (!allowedOriginSet.has(provenanceOrigin)) {
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
        ...trustedOriginsFromEnv(),
    ]);
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
    const FRONTEND_PORT = process.env.SMILEYCHAT_FRONTEND_PORT ?? "5173";

    // Fall back to default frontend origin
    return (process.env.SMILEYCHAT_TRUSTED_ORIGINS ?? `http://127.0.0.1:${FRONTEND_PORT}`)
        .split(",")
        .map((value) => normalizeOrigin(value.trim()))
        .filter((value): value is string => Boolean(value));
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
