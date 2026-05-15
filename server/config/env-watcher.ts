// Hot-reload watcher for the .env file.
//
// Polls every 2s (fs.watchFile interval) and re-applies any change to
// process.env. Most security settings are read through per-request getters
// in runtime-config.ts, so an edit takes effect on the next request.
//
// A small list of keys is "restart required". They're consumed only at
// boot (HOST, PORT, etc.). When one of those changes we still propagate
// the value but log a warning so the operator knows to restart.

import { existsSync, statSync, unwatchFile, watchFile } from "node:fs";

import { getEnvFilePath, reloadRuntimeEnv, type EnvReloadResult } from "./env-loader";

const RESTART_REQUIRED_KEYS = new Set<string>([
    "SMILEYCHAT_PORT",
    "SMILEYCHAT_API_PORT",
    "SMILEYCHAT_FRONTEND_PORT",
    "SMILEYCHAT_HOST",
    "SMILEYCHAT_CSRF_SECRET",
]);

const SENSITIVE_KEYS = new Set<string>([
    "SMILEYCHAT_BASIC_AUTH_PASS",
    "SMILEYCHAT_ADMIN_SECRET",
    "SMILEYCHAT_CSRF_SECRET",
]);

function maskValue(key: string, value: string | undefined): string {
    if (value === undefined) return "<unset>";
    if (SENSITIVE_KEYS.has(key)) {
        if (!value) return "<empty>";
        return `<set, length=${value.length}>`;
    }
    return value === "" ? "<empty>" : value;
}

function describeKey(key: string): string {
    return `${key}=${maskValue(key, process.env[key])}`;
}

function logDiff(diff: EnvReloadResult) {
    const totalChanges = diff.added.length + diff.updated.length + diff.removed.length;
    if (totalChanges === 0) {
        return;
    }

    const restartKeys: string[] = [];
    for (const key of [...diff.added, ...diff.updated, ...diff.removed]) {
        if (RESTART_REQUIRED_KEYS.has(key)) restartKeys.push(key);
    }

    if (diff.added.length > 0) {
        console.log(`[env-watcher] Added: ${diff.added.map(describeKey).join(", ")}`);
    }
    if (diff.updated.length > 0) {
        console.log(`[env-watcher] Updated: ${diff.updated.map(describeKey).join(", ")}`);
    }
    if (diff.removed.length > 0) {
        console.log(`[env-watcher] Removed: ${diff.removed.join(", ")}`);
    }

    if (restartKeys.length > 0) {
        console.warn(
            `[env-watcher] These variables changed but require a server restart to take effect: ${restartKeys.join(", ")}`,
        );
    }
}

export interface EnvWatcherHandle {
    stop(): void;
    reloadNow(): EnvReloadResult | null;
}

export function startEnvWatcher(): EnvWatcherHandle {
    const envPath = getEnvFilePath();
    let stopped = false;

    if (!existsSync(envPath)) {
        console.log(
            `[env-watcher] No .env file at ${envPath}; watcher will pick it up when created.`,
        );
    } else {
        console.log(
            `[env-watcher] Watching ${envPath} for changes (security settings propagate without restart).`,
        );
    }

    let lastMtimeMs = existsSync(envPath) ? statSync(envPath).mtimeMs : 0;
    let lastSize = existsSync(envPath) ? statSync(envPath).size : -1;

    const handler = (curr: { mtimeMs: number; size: number }, prev: { mtimeMs: number }) => {
        if (stopped) return;
        if (curr.mtimeMs === 0 && prev.mtimeMs !== 0) {
            console.warn(
                `[env-watcher] .env disappeared at ${envPath}; clearing previously loaded keys.`,
            );
        }
        if (curr.mtimeMs === lastMtimeMs && curr.size === lastSize) return;
        lastMtimeMs = curr.mtimeMs;
        lastSize = curr.size;
        try {
            const diff = reloadRuntimeEnv();
            logDiff(diff);
        } catch (error) {
            console.error("[env-watcher] Failed to reload .env", error);
        }
    };

    watchFile(envPath, { interval: 2_000, persistent: false }, handler);

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            unwatchFile(envPath, handler);
        },
        reloadNow() {
            try {
                const diff = reloadRuntimeEnv();
                logDiff(diff);
                return diff;
            } catch (error) {
                console.error("[env-watcher] Manual reload failed", error);
                return null;
            }
        },
    };
}
