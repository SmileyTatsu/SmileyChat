import { localApiFetch } from "../api/client";

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export interface ClientLogger {
    debug(message: string, detail?: Record<string, unknown>): void;
    info(message: string, detail?: Record<string, unknown>): void;
    warn(message: string, detail?: Record<string, unknown> | unknown): void;
    error(message: string, errorOrDetail?: unknown): void;
}

type ClientTelemetryEntry = {
    level: ClientLogLevel;
    message: string;
    detail?: Record<string, unknown>;
};

type ClientTelemetryQueue = {
    entries: ClientTelemetryEntry[];
    flushing: boolean;
    flushImmediately: boolean;
    timer?: ReturnType<typeof setTimeout>;
};

const telemetryFlushDelayMs = 350;
const telemetryBatchSize = 32;
const telemetryQueues = new Map<string, ClientTelemetryQueue>();

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

        enqueueClientTelemetry(scope, {
            level,
            message: safeMessage,
            ...(detail ? { detail } : {}),
        });
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

function enqueueClientTelemetry(scope: string, entry: ClientTelemetryEntry) {
    const queue = getClientTelemetryQueue(scope);
    queue.entries.push(entry);

    if (entry.level === "warn" || entry.level === "error") {
        queue.flushImmediately = true;
        flushClientTelemetry(scope);
        return;
    }

    scheduleClientTelemetryFlush(scope);
}

function getClientTelemetryQueue(scope: string) {
    let queue = telemetryQueues.get(scope);

    if (!queue) {
        queue = { entries: [], flushing: false, flushImmediately: false };
        telemetryQueues.set(scope, queue);
    }

    return queue;
}

function scheduleClientTelemetryFlush(scope: string) {
    const queue = getClientTelemetryQueue(scope);

    if (queue.flushing || queue.timer !== undefined) {
        return;
    }

    queue.timer = setTimeout(() => {
        queue.timer = undefined;
        flushClientTelemetry(scope);
    }, telemetryFlushDelayMs);
}

function flushClientTelemetry(scope: string, keepalive = false) {
    const queue = getClientTelemetryQueue(scope);

    if (queue.flushing || queue.entries.length === 0) {
        return;
    }

    if (queue.timer !== undefined) {
        clearTimeout(queue.timer);
        queue.timer = undefined;
    }

    const entries = queue.entries.splice(0, telemetryBatchSize);
    queue.flushing = true;

    void localApiFetch(`/api/plugins/${encodeURIComponent(scope)}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
        ...(keepalive ? { keepalive: true } : {}),
    })
        .catch(() => undefined)
        .finally(() => {
            queue.flushing = false;

            if (queue.entries.length > 0) {
                if (keepalive || queue.flushImmediately) {
                    queue.flushImmediately = false;
                    flushClientTelemetry(scope, keepalive);
                } else {
                    scheduleClientTelemetryFlush(scope);
                }
            } else {
                telemetryQueues.delete(scope);
            }
        });
}

function flushAllClientTelemetry(keepalive: boolean) {
    for (const scope of telemetryQueues.keys()) {
        flushClientTelemetry(scope, keepalive);
    }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("pagehide", () => flushAllClientTelemetry(true));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flushAllClientTelemetry(true);
        }
    });
}
