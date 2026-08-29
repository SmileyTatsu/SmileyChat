import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { logsDir } from "./paths";

export const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
export const LOG_FLUSH_DELAY_MS = 250;

export type LogFile = { path: string; modified: number; size: number };

let currentLogPath: string | null = null;
let currentLogDay: string | null = null;
let currentLogSize = 0;
let pendingLogLines: Array<{ line: string; maxBytes: number }> = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushInFlight: Promise<void> | undefined;

export function resetActiveLogFile() {
    currentLogPath = null;
    currentLogDay = null;
    currentLogSize = 0;
}

export async function getActiveLogPath(
    now = new Date(),
    maxBytes = MAX_LOG_FILE_BYTES,
): Promise<string> {
    const day = now.toISOString().slice(0, 10);
    if (currentLogPath && currentLogDay === day && currentLogSize < maxBytes) {
        return currentLogPath;
    }

    await mkdir(logsDir, { recursive: true });
    currentLogDay = day;

    const todayPrefix = `smileychat-${day}`;
    const allFiles = await listLogFiles();
    const todayFiles = allFiles
        .filter((file) => basename(file.path).startsWith(todayPrefix))
        .sort((a, b) => getFileIndex(basename(a.path)) - getFileIndex(basename(b.path)));

    if (todayFiles.length === 0) {
        currentLogPath = join(logsDir, `${todayPrefix}.log`);
        currentLogSize = 0;
        return currentLogPath;
    }

    const latest = todayFiles[todayFiles.length - 1]!;
    if (latest.size < maxBytes) {
        currentLogPath = latest.path;
        currentLogSize = latest.size;
        return currentLogPath;
    }

    // Latest file is full, create the next indexed file
    const nextIndex = getFileIndex(basename(latest.path)) + 1;
    currentLogPath = join(logsDir, `${todayPrefix}-${nextIndex}.log`);
    currentLogSize = 0;
    return currentLogPath;
}

function getFileIndex(fileName: string): number {
    const match = fileName.match(/^smileychat-\d{4}-\d{2}-\d{2}(?:-(\d+))?\.log$/);
    if (!match) return 0;
    return match[1] ? parseInt(match[1], 10) : 0;
}

export function appendLogLine(
    line: string,
    maxBytes = MAX_LOG_FILE_BYTES,
    flushImmediately = false,
) {
    pendingLogLines.push({ line, maxBytes });
    if (flushImmediately) {
        void flushLogLines().catch(() => undefined);
    } else {
        scheduleLogFlush();
    }
}

export async function flushLogLines() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }

    if (flushInFlight) {
        await flushInFlight;
        if (pendingLogLines.length > 0) {
            await flushLogLines();
        }
        return;
    }

    if (pendingLogLines.length === 0) return;

    const lines = pendingLogLines;
    pendingLogLines = [];
    flushInFlight = writeQueuedLogLines(lines);

    try {
        await flushInFlight;
    } finally {
        flushInFlight = undefined;
    }
}

function scheduleLogFlush() {
    if (flushTimer || flushInFlight) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flushLogLines().catch(() => undefined);
    }, LOG_FLUSH_DELAY_MS);
    flushTimer.unref?.();
}

async function writeQueuedLogLines(lines: Array<{ line: string; maxBytes: number }>) {
    const chunks: Array<{ path: string; content: string }> = [];

    for (const { line, maxBytes } of lines) {
        const lineWithNewline = `${line}\n`;
        const path = await getActiveLogPath(new Date(), maxBytes);
        const lastChunk = chunks[chunks.length - 1];

        if (lastChunk?.path === path) {
            lastChunk.content += lineWithNewline;
        } else {
            chunks.push({ path, content: lineWithNewline });
        }

        // Reserve this space before selecting the next file so a queued batch
        // retains the same rotation behavior as individual appends.
        currentLogSize += Buffer.byteLength(lineWithNewline, "utf8");
    }

    try {
        for (const chunk of chunks) {
            await appendFile(chunk.path, chunk.content, "utf8");
        }
    } catch (error) {
        // The in-memory size may no longer match disk after a failed write.
        // Re-discover the active file on the next successful flush.
        resetActiveLogFile();
        throw error;
    }
}

export async function pruneLogFiles(maxDays: number, maxTotalSizeMb: number) {
    await mkdir(logsDir, { recursive: true });
    const now = Date.now();
    const cutoff = now - maxDays * 86_400_000;
    let files = await listLogFiles();
    for (const file of files.filter((item) => item.modified < cutoff)) {
        await rm(file.path, { force: true });
        if (currentLogPath === file.path) resetActiveLogFile();
    }
    files = await listLogFiles();
    let total = files.reduce((sum, file) => sum + file.size, 0);
    const limit = maxTotalSizeMb * 1024 * 1024;
    for (const file of files.sort((a, b) => a.modified - b.modified)) {
        if (total <= limit) break;
        await rm(file.path, { force: true });
        if (currentLogPath === file.path) resetActiveLogFile();
        total -= file.size;
    }
}

export async function clearLogFiles() {
    await flushLogLines();
    resetActiveLogFile();
    for (const file of await listLogFiles()) {
        await rm(file.path, { force: true });
    }
}

export async function getLogStats() {
    await mkdir(logsDir, { recursive: true });
    const files = await listLogFiles();
    const totalSizeBytes = files.reduce((sum, file) => sum + file.size, 0);
    const sorted = [...files].sort((a, b) => a.modified - b.modified);
    return {
        path: logsDir,
        fileCount: files.length,
        totalSizeBytes,
        oldestDate: sorted[0] ? new Date(sorted[0].modified).toISOString() : undefined,
        newestDate: sorted[sorted.length - 1]
            ? new Date(sorted[sorted.length - 1].modified).toISOString()
            : undefined,
    };
}

export async function listLogFiles(): Promise<LogFile[]> {
    const entries = await readdir(logsDir, { withFileTypes: true }).catch(() => []);
    return Promise.all(
        entries
            .filter((entry) => entry.isFile() && /^smileychat-.*\.log$/.test(entry.name))
            .map(async (entry) => {
                const path = join(logsDir, entry.name);
                const info = await stat(path).catch(() => ({ mtimeMs: 0, size: 0 }));
                return { path, modified: info.mtimeMs, size: info.size };
            }),
    );
}
