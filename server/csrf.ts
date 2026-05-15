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
        throw new HttpError(403, "Invalid CSRF token.");
    }
}

function verifyRequestOrigin(request: Request) {
    const origin = request.headers.get("origin");

    if (!origin) {
        return;
    }

    if (origin !== new URL(request.url).origin) {
        throw new HttpError(403, "Invalid request origin.");
    }
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
