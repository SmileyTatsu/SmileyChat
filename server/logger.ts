import { getLogLevel, isSensitivePayloadLoggingEnabled } from "./config/runtime-config";
import { appendLogLine, pruneLogFiles } from "./log-file-manager";
import { mcpSecretsPath } from "./paths";
import { readAppPreferences, readConnectionSecrets } from "./settings";
import type { AppPreferences } from "#frontend/lib/preferences/types";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type LogSubsystem =
    | "generate"
    | "http"
    | "plugins"
    | "mcp"
    | "server"
    | "security";

export type LogEntry = {
    id: number;
    timestamp: string;
    subsystem: LogSubsystem;
    level: LogLevel;
    message: string;
    detail?: Record<string, unknown>;
    formatted: string;
};

const ranks: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
};
const colors: Record<LogSubsystem, string> = {
    generate: "\x1b[36m",
    http: "\x1b[34m",
    plugins: "\x1b[35m",
    mcp: "\x1b[32m",
    server: "\x1b[37m",
    security: "\x1b[33m",
};

const levelColors: Record<LogLevel, string> = {
    trace: "\x1b[90m",
    debug: "\x1b[90m",
    info: "",
    warn: "\x1b[33m",
    error: "\x1b[31m",
};

let fileEnabled = true;
let maxDays = 7;
let maxTotalSizeMb = 25;
let lastPreferencesRead = 0;
let pruning = false;
let configuredLevel: LogLevel = "info";
let knownSecrets: string[] = [];
let subsystems: AppPreferences["logging"]["subsystems"] = {
    generation: true,
    generationPromptDetails: true,
    generationSamplingDetails: false,
    http: true,
    httpAssetRequests: false,
    plugins: true,
    pluginsClientTelemetry: true,
    mcp: true,
    mcpToolCalls: true,
    server: true,
};

const MAX_MEMORY_LOGS = 1000;
let nextLogId = 1;
const logRingBuffer: LogEntry[] = [];
const logListeners = new Set<(entry: LogEntry) => void>();

const retentionTimer = setInterval(
    () => {
        void readAppPreferences()
            .then((preferences) =>
                pruneLogFiles(
                    preferences.logging.fileLogging.maxDays,
                    preferences.logging.fileLogging.maxTotalSizeMb,
                ),
            )
            .catch(() => undefined);
    },
    60 * 60 * 1000,
);
retentionTimer.unref?.();

// Initial secrets collection
void refreshSecrets();

export function getRecentLogs(): LogEntry[] {
    return [...logRingBuffer];
}

export function subscribeLogs(listener: (entry: LogEntry) => void): () => void {
    logListeners.add(listener);
    return () => {
        logListeners.delete(listener);
    };
}

export function log(
    subsystem: LogSubsystem,
    level: LogLevel,
    message: string,
    detail?: Record<string, unknown>,
    options?: { skipFile?: boolean },
) {
    refreshPreferences();

    const shouldConsole = shouldLog(subsystem, level, message, detail);
    const shouldFile =
        !options?.skipFile &&
        fileEnabled &&
        shouldLogFile(subsystem, level, message, detail);

    const time = new Date();
    const iso = time.toISOString();
    const timeShort = iso.slice(11, 23);
    const suffix = formatDetail(detail);
    const line = `[${timeShort}] [${subsystem}] ${level === "info" ? "" : `${level.toUpperCase()} `}${redact(message)}${suffix}`;

    // Always register in-memory and stream to active in-app live viewers so users can toggle filters freely
    const entry: LogEntry = {
        id: nextLogId++,
        timestamp: iso,
        subsystem,
        level,
        message: redact(message),
        detail: detail ? redactObject(detail) : undefined,
        formatted: line,
    };

    if (logRingBuffer.length >= MAX_MEMORY_LOGS) {
        logRingBuffer.shift();
    }
    logRingBuffer.push(entry);

    for (const listener of logListeners) {
        try {
            listener(entry);
        } catch {
            // Ignore subscriber errors
        }
    }

    if (shouldConsole) {
        // Formatted console output with colored prefix only, keeping message text readable
        const timeFormatted = `\x1b[90m[${timeShort}]\x1b[0m`;
        const subsystemFormatted = `${colors[subsystem]}[${subsystem}]\x1b[0m`;
        const levelFormatted =
            level === "info" ? "" : `${levelColors[level]}${level.toUpperCase()}\x1b[0m `;
        const consoleLine = `${timeFormatted} ${subsystemFormatted} ${levelFormatted}${redact(message)}${suffix}`;

        console.log(consoleLine);
    }

    if (shouldFile) {
        void appendLogLine(`[${iso}] ${line}`).catch(() => undefined);
    }
}

export const logger = {
    trace: (
        s: LogSubsystem,
        m: string,
        d?: Record<string, unknown>,
        o?: { skipFile?: boolean },
    ) => log(s, "trace", m, d, o),
    debug: (
        s: LogSubsystem,
        m: string,
        d?: Record<string, unknown>,
        o?: { skipFile?: boolean },
    ) => log(s, "debug", m, d, o),
    info: (
        s: LogSubsystem,
        m: string,
        d?: Record<string, unknown>,
        o?: { skipFile?: boolean },
    ) => log(s, "info", m, d, o),
    warn: (
        s: LogSubsystem,
        m: string,
        d?: Record<string, unknown>,
        o?: { skipFile?: boolean },
    ) => log(s, "warn", m, d, o),
    error: (
        s: LogSubsystem,
        m: string,
        d?: Record<string, unknown>,
        o?: { skipFile?: boolean },
    ) => log(s, "error", m, d, o),
};

const SENSITIVE_KEY_PATTERN =
    /(?:^|[_-])(?:api[_-]?key|apikey|authorization|auth|token|secret|password|passwd|pass|bearer|credential|credentials|cookie|session[_-]?secret|private[_-]?key|privkey|csrf|xsrf)(?:$|[_-])/i;

export function isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERN.test(key);
}

export function redact(value: string): string {
    if (!value) return value;
    let result = value;

    // 1. Scrub all known loaded secrets from connection-secrets & mcp-secrets
    for (const secret of knownSecrets) {
        if (secret && result.includes(secret)) {
            result = result.split(secret).join("[REDACTED]");
        }
    }

    // 2. Scrub standard authorization parameters, headers, and key=value pairs (including Bearer tokens)
    result = result.replace(
        /(["']?(?:authorization|x-api-key|api[-_]?key|apikey|token|secret|password|passwd|session[-_]?secret|client[-_]?secret|csrf(?:[-_ ]?token)?)["']?\s*[=:]\s*["']?)(?:Bearer\s+)?[^\s,"'};]+/gi,
        "$1[REDACTED]",
    );

    // 3. Scrub standalone Bearer tokens in strings or headers
    result = result.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]");

    // 4. Scrub known provider token formats
    result = result
        .replace(/\b(sk-(?:ant-|proj-)?[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
        .replace(
            /\b(?:AIza[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,})\b/gi,
            "[REDACTED]",
        );

    return result;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (isSensitiveKey(key)) {
            result[key] = "[REDACTED]";
        } else if (typeof value === "string") {
            result[key] = redact(value);
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
            result[key] = redactObject(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            result[key] = value.map((item) =>
                typeof item === "string"
                    ? redact(item)
                    : item && typeof item === "object"
                      ? redactObject(item as Record<string, unknown>)
                      : item,
            );
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function sensitiveLog(
    subsystem: LogSubsystem,
    message: string,
    detail: Record<string, unknown>,
) {
    if (isSensitivePayloadLoggingEnabled()) {
        logger.trace(subsystem, message, detail);
    }
}

function shouldLog(
    subsystem: LogSubsystem,
    level: LogLevel,
    message: string,
    detail?: Record<string, unknown>,
): boolean {
    const envLevel = Bun.env.SMILEYCHAT_LOG_LEVEL
        ? (getLogLevel() as LogLevel)
        : configuredLevel;
    if (ranks[level] < ranks[envLevel]) return false;
    if (subsystem === "security") return true;

    if (subsystem === "generate") {
        if (!subsystems.generation) return false;
        if (message.startsWith("PROMPT") && !subsystems.generationPromptDetails)
            return false;
        if (message.startsWith("SAMPLING") && !subsystems.generationSamplingDetails)
            return false;
        return true;
    }

    if (subsystem === "http") {
        if (!subsystems.http) return false;
        const isAsset =
            (detail && Boolean(detail.asset)) ||
            message.includes("/avatar") ||
            message.includes("/assets/") ||
            message.includes("/attachments/");
        if (isAsset && !subsystems.httpAssetRequests) return false;
        return true;
    }

    if (subsystem === "plugins") {
        if (!subsystems.plugins) return false;
        const isClientTelemetry =
            (detail && Boolean(detail.clientTelemetry)) || message.startsWith("[");
        if (isClientTelemetry && !subsystems.pluginsClientTelemetry) return false;
        return true;
    }

    if (subsystem === "mcp") {
        if (!subsystems.mcp) return false;
        if (message.startsWith("CALL") && !subsystems.mcpToolCalls) return false;
        return true;
    }

    if (subsystem === "server") {
        return subsystems.server;
    }

    return true;
}

function shouldLogFile(
    subsystem: LogSubsystem,
    level: LogLevel,
    message: string,
    detail?: Record<string, unknown>,
): boolean {
    if (ranks[level] < ranks["debug"]) return false;
    if (subsystem === "security") return true;

    if (subsystem === "generate") {
        return subsystems.generation;
    }

    if (subsystem === "http") {
        if (!subsystems.http) return false;
        const isAsset =
            (detail && Boolean(detail.asset)) ||
            message.includes("/avatar") ||
            message.includes("/assets/") ||
            message.includes("/attachments/");
        if (isAsset && !subsystems.httpAssetRequests) return false;
        return true;
    }

    if (subsystem === "plugins") {
        if (!subsystems.plugins) return false;
        const isClientTelemetry =
            (detail && Boolean(detail.clientTelemetry)) || message.startsWith("[");
        if (isClientTelemetry && !subsystems.pluginsClientTelemetry) return false;
        return true;
    }

    if (subsystem === "mcp") {
        return subsystems.mcp;
    }

    if (subsystem === "server") {
        return subsystems.server;
    }

    return true;
}

function formatDetail(detail?: Record<string, unknown>): string {
    if (!detail) return "";
    return Object.entries(detail)
        .map(([key, value]) => {
            if (isSensitiveKey(key)) {
                return ` ${key}=[REDACTED]`;
            }
            return ` ${key}=${redact(typeof value === "string" ? value : JSON.stringify(value))}`;
        })
        .join("");
}

async function refreshSecrets() {
    try {
        const secrets = await readConnectionSecrets().catch(() => null);
        const set = new Set<string>();

        if (secrets?.profiles) {
            for (const profile of Object.values(secrets.profiles)) {
                if (profile && typeof profile === "object") {
                    for (const val of Object.values(profile)) {
                        if (typeof val === "string" && val.trim().length >= 8) {
                            set.add(val.trim());
                        }
                    }
                }
            }
        }

        if (await Bun.file(mcpSecretsPath).exists()) {
            try {
                const mcp = (await Bun.file(mcpSecretsPath).json()) as {
                    servers?: Record<string, Record<string, string>>;
                };
                if (mcp?.servers) {
                    for (const serverSecrets of Object.values(mcp.servers)) {
                        if (serverSecrets && typeof serverSecrets === "object") {
                            for (const val of Object.values(serverSecrets)) {
                                if (typeof val === "string" && val.trim().length >= 8) {
                                    set.add(val.trim());
                                }
                            }
                        }
                    }
                }
            } catch {
                // Ignore MCP json errors
            }
        }

        knownSecrets = Array.from(set).sort((a, b) => b.length - a.length);
    } catch {
        // Ignore
    }
}

function refreshPreferences() {
    if (Date.now() - lastPreferencesRead < 1_000) return;
    lastPreferencesRead = Date.now();
    void Promise.all([
        readAppPreferences()
            .then((preferences) => {
                fileEnabled = preferences.logging.fileLogging.enabled;
                maxDays = preferences.logging.fileLogging.maxDays;
                maxTotalSizeMb = preferences.logging.fileLogging.maxTotalSizeMb;
                configuredLevel = preferences.logging.level;
                subsystems = preferences.logging.subsystems;
                if (!pruning) {
                    pruning = true;
                    void pruneLogFiles(maxDays, maxTotalSizeMb).finally(() => {
                        pruning = false;
                    });
                }
            })
            .catch(() => undefined),
        refreshSecrets(),
    ]);
}
