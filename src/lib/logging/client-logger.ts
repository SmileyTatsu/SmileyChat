import { localApiFetch } from "../api/client";

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export interface ClientLogger {
    debug(message: string, detail?: Record<string, unknown>): void;
    info(message: string, detail?: Record<string, unknown>): void;
    warn(message: string, detail?: Record<string, unknown> | unknown): void;
    error(message: string, errorOrDetail?: unknown): void;
}

export function createClientLogger(scope = "runtime"): ClientLogger {
    const write = (
        level: ClientLogLevel,
        message: string,
        detail?: Record<string, unknown>,
    ) => {
        const safeMessage = String(message).slice(0, 2048);
        const prefix = `[${scope}] ${safeMessage}`;

        if (detail && Object.keys(detail).length > 0) {
            console[level](prefix, detail);
        } else {
            console[level](prefix);
        }

        void localApiFetch(`/api/plugins/${encodeURIComponent(scope)}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                level,
                message: safeMessage,
                ...(detail ? { detail } : {}),
            }),
        }).catch(() => undefined);
    };

    return {
        debug(message: string, detail?: Record<string, unknown>) {
            write("debug", message, detail);
        },
        info(message: string, detail?: Record<string, unknown>) {
            write("info", message, detail);
        },
        warn(message: string, detail?: Record<string, unknown> | unknown) {
            const normalizedDetail =
                detail instanceof Error
                    ? {
                          error: detail.message,
                          ...(detail.stack ? { stack: detail.stack } : {}),
                      }
                    : detail && typeof detail === "object" && !Array.isArray(detail)
                      ? (detail as Record<string, unknown>)
                      : detail !== undefined
                        ? { error: String(detail) }
                        : undefined;
            write("warn", message, normalizedDetail);
        },
        error(message: string, errorOrDetail?: unknown) {
            const normalizedDetail =
                errorOrDetail instanceof Error
                    ? {
                          error: errorOrDetail.message,
                          ...(errorOrDetail.stack ? { stack: errorOrDetail.stack } : {}),
                      }
                    : errorOrDetail &&
                        typeof errorOrDetail === "object" &&
                        !Array.isArray(errorOrDetail)
                      ? (errorOrDetail as Record<string, unknown>)
                      : errorOrDetail !== undefined
                        ? { error: String(errorOrDetail) }
                        : undefined;
            write("error", message, normalizedDetail);
        },
    };
}

export const clientLogger = createClientLogger("runtime");
