// Extra access gate for dangerous endpoints (currently the
// connection-secrets reads, the bulk plugin storage delete, and similar
// "if this leaks, the user's whole install is compromised" routes).
//
// Routes call requirePrivilegedAccess(request, ip, opts) inline at the
// top of their handler. The gate returns a Response on failure (which
// the handler should return directly) or null on success.

import { timingSafeEqual } from "node:crypto";

import {
    getAdminSecret,
    isAdminSecretRequiredOnLoopback,
} from "../config/runtime-config";

import { isBasicAuthSatisfied } from "./basic-auth";
import { isLoopbackIp } from "./ip-allowlist";

function safeCompareString(left: string, right: string): boolean {
    const a = Buffer.from(left, "utf8");
    const b = Buffer.from(right, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

export interface PrivilegedGateOptions {
    /** Reject everything except loopback (regardless of admin secret). */
    loopbackOnly?: boolean;
    /** Human-readable feature name used in error messages. */
    feature?: string;
}

export function requirePrivilegedAccess(
    request: Request,
    ip: string,
    options: PrivilegedGateOptions = {},
): Response | null {
    if (!isBasicAuthSatisfied(request, ip)) {
        return jsonResponse(403, {
            error: "Privileged endpoint requires authenticated access.",
            code: "privileged_auth_required",
        });
    }

    if (options.loopbackOnly && !isLoopbackIp(ip)) {
        return jsonResponse(403, {
            error: `${options.feature ?? "This endpoint"} is available only from loopback.`,
            code: "privileged_loopback_only",
        });
    }

    if (isLoopbackIp(ip) && !isAdminSecretRequiredOnLoopback()) {
        return null;
    }

    const secret = getAdminSecret();
    if (!secret) {
        return jsonResponse(403, {
            error:
                "SMILEYCHAT_ADMIN_SECRET is required for privileged endpoints when accessed from a non-loopback IP. " +
                "Set it in your .env and send it as the X-SmileyChat-Admin-Secret header.",
            code: "admin_secret_missing",
        });
    }

    const provided = request.headers.get("x-smileychat-admin-secret");
    if (typeof provided !== "string" || !safeCompareString(provided, secret)) {
        return jsonResponse(403, {
            error: "Invalid or missing X-SmileyChat-Admin-Secret header.",
            code: "admin_secret_invalid",
        });
    }

    return null;
}
