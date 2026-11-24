/**
 * Runtime for optional plugin server modules.
 *
 * A plugin may ship an ESM entry (`serverMain` in its manifest) exporting
 * `activate(host)`. This module loads that entry inside the Bun server, hands it
 * a small host object, owns every process it spawns, and tears all of it down.
 *
 * Plugin modules are trusted in-process code. They run with full access to the
 * server process and are NOT sandboxed; only install plugins from sources the
 * user trusts. Permission gating (`server:process`) is decided by the caller
 * before it starts a plugin server here.
 *
 * This is a leaf module: it knows nothing about specific plugins and imports
 * only logger/process helpers plus Node/Bun builtins.
 */
import { cp, mkdir, readdir, realpath, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { logger } from "./logger";
import { killProcessTree } from "./process-tree";
import { assignProcessToSmileyChatJob } from "./windows-process-job";

export type PluginServerLogger = {
    debug(message: string, detail?: Record<string, unknown>): void;
    info(message: string, detail?: Record<string, unknown>): void;
    warn(message: string, detail?: Record<string, unknown>): void;
    error(message: string, detail?: Record<string, unknown>): void;
};

export type ManagedProcess = {
    readonly pid: number;
    readonly exited: Promise<number | null>;
    kill(): Promise<void>;
};

export type PluginServerSpawnOptions = {
    cwd?: string;
    env?: Record<string, string>;
};

export type PluginServerHost = {
    readonly pluginId: string;
    /** Absolute path of the plugin's `data/` folder, created if missing. */
    readonly dataDir: string;
    /** Logger writing to the `plugins` subsystem, messages prefixed with `[<pluginId>]`. */
    readonly logger: PluginServerLogger;
    spawn(
        command: string,
        args?: string[],
        options?: PluginServerSpawnOptions,
    ): ManagedProcess;
};

export type PluginServerInstance = {
    handle?(request: Request, subpath: string): Response | Promise<Response>;
    dispose?(): void | Promise<void>;
};

export type PluginServerStatus = {
    state: "running" | "stopped" | "error";
    error?: string;
    startedAt?: string;
    processCount: number;
    lastRequestError?: string;
};

export type StartPluginServerOptions = {
    pluginId: string;
    pluginRoot: string;
    /** Relative path of the ESM entry inside `pluginRoot`. */
    serverMain: string;
    /** Caller-computed fingerprint of the installed version/files. */
    signature: string;
};

type PluginServerActivate = (host: PluginServerHost) => unknown;

type PluginServerRecord = {
    readonly pluginId: string;
    pluginRoot?: string;
    signature?: string;
    state: PluginServerStatus["state"];
    error?: string;
    startedAt?: string;
    lastRequestError?: string;
    instance?: PluginServerInstance;
    /** True between the start of `activate()` and the end of the start call. */
    starting: boolean;
    /** True from the moment a stop is requested until the next start. */
    stopping: boolean;
    processes: Set<ManagedProcess>;
    /** Settles (never rejects) when the in-flight `activate()` call finishes. */
    activation?: Promise<void>;
    /** Cleanup for an `activate()` that settles after we stopped waiting. */
    lateActivation?: Promise<void>;
    /** Private copy of the plugin code this start loaded its module from. */
    moduleDir?: string;
};

type ResolvedServerEntry = {
    /** Real path of the entry file. */
    entry: string;
    /** Real path of the plugin folder the entry lives in. */
    root: string;
    /** Entry path relative to `root`. */
    relativePath: string;
};

const ACTIVATION_TIMEOUT_MS = 15_000;
const DISPOSE_TIMEOUT_MS = 5_000;
const EXIT_TIMEOUT_MS = 3_000;
const MAX_LOG_LINE_LENGTH = 2_000;

const records = new Map<string, PluginServerRecord>();
const lifecycle = new Map<string, Promise<void>>();

/** Incrementing part of the module load token, so two starts never share one. */
let moduleCounter = 0;

export async function startPluginServer(
    options: StartPluginServerOptions,
): Promise<PluginServerStatus> {
    const record = getRecord(options.pluginId);
    return withLifecycleLock(record.pluginId, () => startLocked(record, options));
}

export async function stopPluginServer(pluginId: string): Promise<void> {
    const record = records.get(pluginId);
    if (!record) return;

    // Refuse new spawns right away, so an `activate()` that is still running
    // (or a handle called from a racing request) cannot create a process that
    // the queued teardown never sees.
    record.stopping = true;
    record.state = "stopped";

    await withLifecycleLock(pluginId, () => teardown(record));
}

export async function stopAllPluginServers(): Promise<void> {
    await Promise.all([...records.keys()].map((pluginId) => stopPluginServer(pluginId)));
}

export function getPluginServerStatus(pluginId: string): PluginServerStatus {
    const record = records.get(pluginId);
    if (!record) return { state: "stopped", processCount: 0 };
    return statusOf(record);
}

export function getPluginServerSignature(pluginId: string): string | undefined {
    return records.get(pluginId)?.signature;
}

export async function handlePluginServerRequest(
    pluginId: string,
    request: Request,
    subpath: string,
): Promise<Response> {
    const record = records.get(pluginId);
    const instance = record?.state === "running" ? record.instance : undefined;

    if (!record || record.stopping || record.state !== "running" || !instance) {
        const error =
            record?.state === "error" && record.error
                ? record.error
                : "Plugin server is not running.";
        return jsonResponse({ error }, 503);
    }

    const handle = instance.handle;
    if (!handle)
        return jsonResponse({ error: "Plugin server has no request handler." }, 404);

    try {
        const response = await handle(request, subpath);
        if (!(response instanceof Response)) {
            throw new Error("Plugin server handle() did not return a Response.");
        }
        record.lastRequestError = undefined;
        return response;
    } catch (error) {
        const message = errorMessage(error);
        record.lastRequestError = message;
        logger.error("plugins", `${pluginLogPrefix(pluginId)} request failed`, {
            subpath,
            error: message,
        });
        return jsonResponse({ error: "Plugin server request failed." }, 500);
    }
}

async function startLocked(
    record: PluginServerRecord,
    options: StartPluginServerOptions,
): Promise<PluginServerStatus> {
    const { pluginId, pluginRoot, serverMain, signature } = options;

    await teardown(record);

    record.pluginRoot = pluginRoot;
    record.signature = signature;
    record.error = undefined;
    record.startedAt = undefined;
    record.lastRequestError = undefined;
    record.state = "stopped";
    record.stopping = false;
    record.starting = true;

    try {
        const resolved = await resolveServerEntry(pluginRoot, serverMain);
        const dataDir = join(pluginRoot, "data");
        await mkdir(dataDir, { recursive: true });

        const importUrl = await prepareModuleUrl(record, resolved);
        const loaded = (await import(importUrl)) as Record<string, unknown>;
        const activate = loaded.activate;
        if (typeof activate !== "function") {
            throw new Error(
                `Plugin "${pluginId}" server module does not export an activate() function.`,
            );
        }

        record.instance = await activateInstance(
            record,
            activate as PluginServerActivate,
            dataDir,
        );
        record.state = "running";
        record.startedAt = new Date().toISOString();

        logger.info("plugins", `${pluginLogPrefix(pluginId)} started`, {
            serverMain,
            signature,
            processCount: record.processes.size,
        });
        return statusOf(record);
    } catch (error) {
        return await failStart(record, error);
    } finally {
        record.starting = false;
    }
}

async function failStart(
    record: PluginServerRecord,
    error: unknown,
): Promise<PluginServerStatus> {
    const message = errorMessage(error);

    // Close the spawn window before killing, so a late async task inside the
    // failing plugin cannot add a process after the sweep below.
    record.starting = false;
    record.state = "error";
    record.error = message;
    record.startedAt = undefined;
    record.instance = undefined;

    logger.error("plugins", `${pluginLogPrefix(record.pluginId)} failed to start`, {
        error: message,
    });

    // Anything `activate()` spawned before failing dies with the start attempt.
    await killProcesses(record);
    await releaseModuleCopy(record);

    return statusOf(record);
}

async function activateInstance(
    record: PluginServerRecord,
    activate: PluginServerActivate,
    dataDir: string,
): Promise<PluginServerInstance> {
    const host = createHost(record, dataDir);
    let settled = false;

    const tracked = Promise.resolve()
        .then(() => activate(host))
        .then(
            (value) => {
                settled = true;
                return value;
            },
            (error) => {
                settled = true;
                throw error;
            },
        );

    // Observing the promise keeps a late rejection from becoming unhandled.
    record.activation = tracked.then(
        () => undefined,
        () => undefined,
    );

    try {
        const result = await withTimeout(
            tracked,
            ACTIVATION_TIMEOUT_MS,
            `Plugin "${record.pluginId}" activate() did not finish within ${
                ACTIVATION_TIMEOUT_MS / 1000
            } seconds.`,
        );
        return normalizeInstance(result);
    } catch (error) {
        if (!settled) {
            // `activate()` is still running. It can no longer spawn anything,
            // but a late success must still be disposed instead of leaking.
            record.lateActivation = tracked.then(
                (value) =>
                    disposeInstance(record, normalizeInstance(value), "late activation"),
                () => undefined,
            );
        }
        throw error;
    }
}

async function teardown(record: PluginServerRecord): Promise<void> {
    record.stopping = true;
    record.starting = false;
    record.state = "stopped";
    record.error = undefined;
    record.startedAt = undefined;
    record.lastRequestError = undefined;
    record.signature = undefined;

    const instance = record.instance;
    record.instance = undefined;

    if (instance) await disposeInstance(record, instance, "dispose");

    if (record.activation) {
        await settleWithin(record.activation, DISPOSE_TIMEOUT_MS);
        record.activation = undefined;
    }
    if (record.lateActivation) {
        await settleWithin(record.lateActivation, DISPOSE_TIMEOUT_MS);
        record.lateActivation = undefined;
    }

    await killProcesses(record);
    await releaseModuleCopy(record);
}

async function disposeInstance(
    record: PluginServerRecord,
    instance: PluginServerInstance,
    reason: string,
): Promise<void> {
    const dispose = instance.dispose;
    if (!dispose) return;

    try {
        await withTimeout(
            Promise.resolve().then(() => dispose()),
            DISPOSE_TIMEOUT_MS,
            `Plugin "${record.pluginId}" dispose() did not finish within ${
                DISPOSE_TIMEOUT_MS / 1000
            } seconds.`,
        );
    } catch (error) {
        logger.error("plugins", `${pluginLogPrefix(record.pluginId)} ${reason} failed`, {
            error: errorMessage(error),
        });
    }
}

async function killProcesses(record: PluginServerRecord): Promise<void> {
    const processes = [...record.processes];
    record.processes.clear();
    await Promise.all(processes.map((item) => item.kill().catch(() => undefined)));
}

function createHost(record: PluginServerRecord, dataDir: string): PluginServerHost {
    const pluginId = record.pluginId;
    const prefix = pluginLogPrefix(pluginId);
    const pluginLogger: PluginServerLogger = {
        debug: (message, detail) =>
            logger.debug("plugins", `${prefix} ${message}`, detail),
        info: (message, detail) => logger.info("plugins", `${prefix} ${message}`, detail),
        warn: (message, detail) => logger.warn("plugins", `${prefix} ${message}`, detail),
        error: (message, detail) =>
            logger.error("plugins", `${prefix} ${message}`, detail),
    };

    return {
        pluginId,
        dataDir,
        logger: pluginLogger,
        spawn: (command, args = [], options = {}) =>
            spawnProcess(record, pluginLogger, command, args, options),
    };
}

function spawnProcess(
    record: PluginServerRecord,
    hostLogger: PluginServerLogger,
    command: string,
    args: string[],
    options: PluginServerSpawnOptions,
): ManagedProcess {
    if (!canSpawn(record)) throw new Error("Plugin server is stopped.");

    const cwd = options.cwd ?? record.pluginRoot;
    if (!cwd) throw new Error("Plugin server is stopped.");

    let child: ReturnType<typeof Bun.spawn>;
    try {
        child = Bun.spawn([command, ...args], {
            cwd,
            env: buildEnv(options.env),
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            windowsHide: process.platform === "win32",
        });
    } catch (error) {
        hostLogger.error(`Failed to start process "${command}"`, {
            error: errorMessage(error),
        });
        throw error;
    }

    // Same safety net the MCP stdio transport uses: if SmileyChat dies without
    // running shutdown handlers, Windows still kills the child with the job.
    assignProcessToSmileyChatJob(child.pid);

    const managed = trackProcess(record, hostLogger, child, command);
    record.processes.add(managed);
    hostLogger.debug(`Started process "${command}" (pid ${child.pid})`);

    return managed;
}

function trackProcess(
    record: PluginServerRecord,
    hostLogger: PluginServerLogger,
    child: ReturnType<typeof Bun.spawn>,
    command: string,
): ManagedProcess {
    const pid = child.pid;
    let exited = false;
    let killedByRuntime = false;

    const exitedPromise: Promise<number | null> = child.exited.then(
        (code) => code,
        () => null,
    );

    drainLines(child.stdout, (line) => hostLogger.debug(line, { stream: "stdout" }));
    drainLines(child.stderr, (line) => hostLogger.debug(line, { stream: "stderr" }));

    const managed: ManagedProcess = {
        pid,
        exited: exitedPromise,
        kill: async () => {
            killedByRuntime = true;
            if (!exited) killProcessTree(pid);

            await Promise.race([
                exitedPromise.then(() => undefined),
                Bun.sleep(EXIT_TIMEOUT_MS),
            ]);

            if (!exited) {
                try {
                    child.kill("SIGKILL");
                } catch {
                    // Already gone.
                }
            }
        },
    };

    void exitedPromise.then((code) => {
        exited = true;
        record.processes.delete(managed);

        if (killedByRuntime || record.stopping) {
            hostLogger.debug(`Process "${command}" (pid ${pid}) stopped`, {
                exitCode: code,
            });
        } else {
            hostLogger.warn(`Process "${command}" (pid ${pid}) exited unexpectedly`, {
                exitCode: code,
            });
        }
    });

    return managed;
}

/** Read a piped stream line by line so a chatty child can never block on a full pipe. */
function drainLines(
    stream: ReadableStream<Uint8Array> | number | undefined,
    onLine: (line: string) => void,
) {
    if (!stream || typeof stream === "number") return;

    const decoder = new TextDecoder();
    let buffer = "";

    const emit = (line: string) => {
        const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (!trimmed) return;
        onLine(
            trimmed.length > MAX_LOG_LINE_LENGTH
                ? `${trimmed.slice(0, MAX_LOG_LINE_LENGTH)}…`
                : trimmed,
        );
    };

    void (async () => {
        const reader = stream.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let newline = buffer.indexOf("\n");
                while (newline >= 0) {
                    emit(buffer.slice(0, newline));
                    buffer = buffer.slice(newline + 1);
                    newline = buffer.indexOf("\n");
                }

                // A single runaway line must not grow without bound.
                if (buffer.length > MAX_LOG_LINE_LENGTH * 4) {
                    emit(buffer);
                    buffer = "";
                }
            }
            emit(buffer);
        } catch {
            // The child closed its pipe; nothing left to drain.
        } finally {
            try {
                reader.releaseLock();
            } catch {
                // Reader already released.
            }
        }
    })();
}

async function resolveServerEntry(
    pluginRoot: string,
    serverMain: string,
): Promise<ResolvedServerEntry> {
    const entryName = typeof serverMain === "string" ? serverMain.trim() : "";
    if (!entryName) throw new Error("Plugin server entry is missing.");

    if (isAbsolute(entryName)) {
        throw new Error(
            `Plugin server entry "${entryName}" must be relative to the plugin folder.`,
        );
    }

    const root = resolve(pluginRoot);
    const entry = resolve(root, entryName);
    if (escapes(root, entry)) {
        throw new Error(
            `Plugin server entry "${entryName}" is outside the plugin folder.`,
        );
    }

    const stats = await stat(entry).catch(() => null);
    if (!stats?.isFile()) {
        throw new Error(`Plugin server entry "${entryName}" does not exist.`);
    }

    // A symlink inside the plugin folder could still point outside of it.
    const [realRoot, realEntry] = await Promise.all([realpath(root), realpath(entry)]);
    if (escapes(realRoot, realEntry)) {
        throw new Error(
            `Plugin server entry "${entryName}" resolves outside the plugin folder.`,
        );
    }

    return {
        entry: realEntry,
        root: realRoot,
        relativePath: relative(realRoot, realEntry),
    };
}

/**
 * Bun keeps evaluated ESM modules for the lifetime of the process and keys them
 * by file path: neither `?v=` queries nor edits on disk reload a module, and a
 * restart would otherwise keep running the code from the previous install.
 *
 * Importing through a per-start directory link would refresh the module graph,
 * but on Windows Bun then holds a handle on the real plugin folder (verified:
 * renaming the folder fails with EPERM even after the link is removed). So each
 * start gets a private copy of the plugin's code tree instead, and the module is
 * imported from there with a unique query token. `data/` is not copied: plugins
 * must read and write user data through `host.dataDir`.
 *
 * Copies left behind by a crash or a hard kill are swept before the new one is
 * made. Starts are serialized per plugin id and the previous instance was torn
 * down already, so nothing else under this plugin's runtime root is in use.
 */
async function prepareModuleUrl(
    record: PluginServerRecord,
    resolved: ResolvedServerEntry,
): Promise<string> {
    moduleCounter += 1;
    const token = `${moduleCounter}-${Date.now()}`;
    const runtimeRoot = join(
        tmpdir(),
        "smileychat-plugin-runtime",
        record.pluginId.replace(/[^A-Za-z0-9._-]/g, "_"),
    );

    try {
        await mkdir(runtimeRoot, { recursive: true });
        const moduleDir = join(runtimeRoot, token);
        await removeStaleCopies(runtimeRoot, token);
        const dataDir = join(resolved.root, "data");
        await cp(resolved.root, moduleDir, {
            recursive: true,
            filter: (source) => source !== dataDir,
        });
        record.moduleDir = moduleDir;
        return `${pathToFileURL(join(moduleDir, resolved.relativePath)).href}?v=${token}`;
    } catch (error) {
        // Falling back to the real path keeps the plugin working, at the cost of
        // Bun serving the module it cached for an earlier start.
        logger.warn(
            "plugins",
            `${pluginLogPrefix(record.pluginId)} Could not copy the plugin for a fresh module load; ` +
                "reloading the plugin server may reuse cached code",
            { error: errorMessage(error) },
        );
        return `${pathToFileURL(resolved.entry).href}?v=${token}`;
    }
}

async function removeStaleCopies(runtimeRoot: string, keep: string) {
    const entries = await readdir(runtimeRoot).catch(() => [] as string[]);
    await Promise.all(
        entries
            .filter((name) => name !== keep)
            .map((name) =>
                rm(join(runtimeRoot, name), { recursive: true, force: true }).catch(
                    () => undefined,
                ),
            ),
    );
}

async function releaseModuleCopy(record: PluginServerRecord) {
    const moduleDir = record.moduleDir;
    record.moduleDir = undefined;
    if (!moduleDir) return;

    await rm(moduleDir, { recursive: true, force: true }).catch(() => undefined);
    await rmdir(dirname(moduleDir)).catch(() => undefined);
}

function canSpawn(record: PluginServerRecord) {
    if (record.stopping) return false;
    return record.starting || record.state === "running";
}

function buildEnv(extra?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === "string") env[key] = value;
    }
    return { ...env, ...extra };
}

function normalizeInstance(value: unknown): PluginServerInstance {
    const instance: PluginServerInstance = {};
    if (!value || typeof value !== "object") return instance;

    const candidate = value as { handle?: unknown; dispose?: unknown };
    if (typeof candidate.handle === "function") {
        instance.handle = candidate.handle.bind(value) as PluginServerInstance["handle"];
    }
    if (typeof candidate.dispose === "function") {
        instance.dispose = candidate.dispose.bind(
            value,
        ) as PluginServerInstance["dispose"];
    }
    return instance;
}

function statusOf(record: PluginServerRecord): PluginServerStatus {
    const status: PluginServerStatus = {
        state: record.state,
        processCount: record.processes.size,
    };
    if (record.error) status.error = record.error;
    if (record.state === "running" && record.startedAt)
        status.startedAt = record.startedAt;
    if (record.lastRequestError) status.lastRequestError = record.lastRequestError;
    return status;
}

function getRecord(pluginId: string): PluginServerRecord {
    const existing = records.get(pluginId);
    if (existing) return existing;

    const record: PluginServerRecord = {
        pluginId,
        state: "stopped",
        starting: false,
        stopping: false,
        processes: new Set(),
    };
    records.set(pluginId, record);
    return record;
}

/**
 * Serialize start/stop per plugin id so concurrent lifecycle calls cannot
 * interleave or load the same plugin twice.
 */
function withLifecycleLock<T>(pluginId: string, task: () => Promise<T>): Promise<T> {
    const previous = lifecycle.get(pluginId) ?? Promise.resolve();
    const run = previous.then(task, task);

    const tail = run.then(
        () => undefined,
        () => undefined,
    );
    lifecycle.set(pluginId, tail);
    void tail.then(() => {
        if (lifecycle.get(pluginId) === tail) lifecycle.delete(pluginId);
    });

    return run;
}

async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), ms);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function settleWithin(promise: Promise<unknown>, ms: number) {
    await withTimeout(promise, ms, "Timed out.").catch(() => undefined);
}

function escapes(root: string, target: string) {
    const inside = relative(root, target);
    return (
        !inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)
    );
}

/**
 * Log prefix for a plugin server message. It must not start with "[": the
 * `plugins` log filter treats a leading bracket as client telemetry and hides
 * those lines from the console by default.
 */
function pluginLogPrefix(pluginId: string) {
    return `Plugin server ${pluginId}:`;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
