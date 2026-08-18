import { describe, expect, test } from "bun:test";
import {
    getRecentLogs,
    log,
    logger,
    redact,
    redactObject,
    subscribeLogs,
} from "./logger";
import {
    appendLogLine,
    clearLogFiles,
    getActiveLogPath,
    getLogStats,
    resetActiveLogFile,
} from "./log-file-manager";

describe("logger", () => {
    test("redacts sensitive credential patterns", () => {
        expect(redact("sk-proj-1234567890abcdef123456")).toBe("[REDACTED]");
        expect(redact("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz")).toBe(
            "Bearer [REDACTED]",
        );
        expect(redact("api_key=sk-proj-1234567890abcdef123456")).toBe(
            "api_key=[REDACTED]",
        );
        expect(redact("Authorization: Bearer sk-ant-1234567890abcdef123456")).toBe(
            "Authorization: [REDACTED]",
        );
        expect(redact("api-key: AIzaSyD1234567890abcdef123456")).toBe(
            "api-key: [REDACTED]",
        );
        expect(redact("password: mySuperSecretPassword123")).toBe("password: [REDACTED]");
        expect(redact("csrf_token: 9876543210fedcba")).toBe("csrf_token: [REDACTED]");
    });

    test("redacts sensitive keys in objects and nested structures", () => {
        const obj = {
            apiKey: "sk-proj-1234567890abcdef123456",
            provider: "anthropic",
            customConfig: {
                token: "secret-token-value-123",
                normalField: "visible",
            },
            headers: ["Authorization: Bearer secret-value-456"],
        };

        const cleaned = redactObject(obj);
        expect(cleaned.apiKey).toBe("[REDACTED]");
        expect(cleaned.provider).toBe("anthropic");
        expect((cleaned.customConfig as Record<string, unknown>).token).toBe(
            "[REDACTED]",
        );
        expect((cleaned.customConfig as Record<string, unknown>).normalField).toBe(
            "visible",
        );
        expect((cleaned.headers as string[])[0]).toBe("Authorization: [REDACTED]");
    });

    test("redacts and formats Error instances in detail objects", () => {
        const error = new Error("Failed with secret sk-proj-1234567890abcdef123456");
        const obj = { error };
        const cleaned = redactObject(obj);
        expect(typeof cleaned.error).toBe("object");
        const errObj = cleaned.error as { name: string; message: string; stack?: string };
        expect(errObj.name).toBe("Error");
        expect(errObj.message).toBe("Failed with secret [REDACTED]");
        if (errObj.stack) {
            expect(errObj.stack).not.toContain("sk-proj-1234567890abcdef123456");
        }
    });

    test("records logs to in-memory buffer and dispatches to subscribers", () => {
        const received: unknown[] = [];
        const unsubscribe = subscribeLogs((entry) => {
            received.push(entry);
        });

        logger.info("server", "Test log message for unit tests", { testKey: "testVal" });
        unsubscribe();

        const recent = getRecentLogs();
        expect(recent.length).toBeGreaterThan(0);
        const last = recent[recent.length - 1];
        expect(last?.subsystem).toBe("server");
        expect(last?.message).toContain("Test log message for unit tests");
        expect(last?.detail?.testKey).toBe("testVal");
        expect(received.length).toBeGreaterThan(0);
    });

    test("supports skipFile option to avoid writing to disk", async () => {
        await Bun.sleep(20);
        await clearLogFiles();
        log(
            "server",
            "info",
            "Ephemeral message that should not create file on disk",
            undefined,
            { skipFile: true },
        );
        await Bun.sleep(20);
        const stats = await getLogStats();
        expect(stats.fileCount).toBe(0);
        expect(stats.totalSizeBytes).toBe(0);
    });

    test("registers asset HTTP requests and telemetry in memory buffer", () => {
        log("http", "info", "GET /api/characters/123/avatar -> 200", { asset: true });
        const recent = getRecentLogs();
        const hasAsset = recent.some((item) => item.message.includes("/avatar"));
        expect(hasAsset).toBe(true);

        log("http", "info", "GET /api/characters -> 200");
        const hasHttp = getRecentLogs().some((item) =>
            item.message.includes("GET /api/characters -> 200"),
        );
        expect(hasHttp).toBe(true);
    });

    test("registers debug logs in buffer and writes them to file", async () => {
        await Bun.sleep(25);
        await clearLogFiles();
        resetActiveLogFile();

        // Emit a debug-level log message (e.g. routine /api/* call)
        log("http", "debug", "GET /api/characters -> 200", { durationMs: 1 });
        await Bun.sleep(25);

        // In-memory buffer captures all events so in-app viewer can filter them
        const recent = getRecentLogs();
        const hasDebugInViewer = recent.some(
            (item) =>
                item.level === "debug" &&
                item.message.includes("GET /api/characters -> 200"),
        );
        expect(hasDebugInViewer).toBe(true);

        // And the log file on disk also captures it!
        const stats = await getLogStats();
        expect(stats.fileCount).toBeGreaterThanOrEqual(1);
        expect(stats.totalSizeBytes).toBeGreaterThan(0);

        await clearLogFiles();
    });

    test("rotates log files sequentially when size limit is reached", async () => {
        await Bun.sleep(25);
        await clearLogFiles();
        resetActiveLogFile();

        // Write with a small 50-byte limit to test rotation
        const maxBytes = 50;

        // Line 1 (20 bytes) -> base file (size 20 < 50)
        await appendLogLine("Short line 1", maxBytes);
        const path1 = await getActiveLogPath(new Date(), maxBytes);
        expect(path1).toMatch(/smileychat-\d{4}-\d{2}-\d{2}\.log$/);

        // Line 2 (40 bytes) -> pushes base file to 60 bytes (>= 50)
        await appendLogLine("Line 2 that fills base log past limit", maxBytes);

        // Line 3 (20 bytes) -> rotates to -1.log (size 20 < 50)
        await appendLogLine("Short line 3", maxBytes);
        const path2 = await getActiveLogPath(new Date(), maxBytes);
        expect(path2).toMatch(/smileychat-\d{4}-\d{2}-\d{2}-1\.log$/);

        // Line 4 (40 bytes) -> pushes -1.log to 60 bytes (>= 50)
        await appendLogLine("Line 4 that fills first sibling past limit", maxBytes);

        // Line 5 (20 bytes) -> rotates to -2.log (size 20 < 50)
        await appendLogLine("Short line 5", maxBytes);
        const path3 = await getActiveLogPath(new Date(), maxBytes);
        expect(path3).toMatch(/smileychat-\d{4}-\d{2}-\d{2}-2\.log$/);

        // Clean up test files
        await clearLogFiles();
    });
});
