// .env loader with first-boot auto-create and hot-reload.
//
// Bun loads .env automatically at process start, so this module's job is
// twofold:
//
//   1. ensureEnvFileExists(): if no .env is present, drop the template
//      shipped as .env.example into place so the user has somewhere to
//      add their settings. Runs once on boot.
//
//   2. reloadRuntimeEnv(): re-parse .env and propagate the diff to
//      process.env. Keys removed from the file are deleted so unsetting
//      e.g. SMILEYCHAT_BASIC_AUTH_PASS takes effect immediately. Called
//      by env-watcher when the file's mtime/size changes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { envFilePath, rootDir } from "../paths";

const envExamplePath = `${rootDir}/.env.example`;

let envFileKeys = new Set<string>();
let initialLoadDone = false;

export interface EnvReloadResult {
    added: string[];
    updated: string[];
    removed: string[];
    unchanged: string[];
}

export function getEnvFilePath() {
    return envFilePath;
}

export function ensureEnvFileExists() {
    if (existsSync(envFilePath)) {
        return false;
    }

    try {
        mkdirSync(dirname(envFilePath), { recursive: true });
    } catch {
        // best-effort
    }

    const template = existsSync(envExamplePath)
        ? readFileSync(envExamplePath, "utf8")
        : "# SmileyChat configuration\n";

    try {
        writeFileSync(envFilePath, template, { flag: "wx" });
        return true;
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
            return false;
        }
        throw error;
    }
}

export function loadRuntimeEnv() {
    if (initialLoadDone) {
        return;
    }

    initialLoadDone = true;

    if (!existsSync(envFilePath)) {
        envFileKeys = new Set();
        return;
    }

    const parsed = parseEnvFile(readFileSync(envFilePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
        // Don't clobber values that were already exported in the shell.
        // Bun's built-in dotenv loader uses the same precedence.
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
    envFileKeys = new Set(Object.keys(parsed));
}

export function reloadRuntimeEnv(): EnvReloadResult {
    if (!existsSync(envFilePath)) {
        const removed = [...envFileKeys];
        for (const key of removed) {
            delete process.env[key];
        }
        envFileKeys = new Set();
        return { added: [], updated: [], removed, unchanged: [] };
    }

    const parsed = parseEnvFile(readFileSync(envFilePath, "utf8"));
    const newKeys = new Set(Object.keys(parsed));

    const added: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];
    const removed: string[] = [];

    for (const [key, value] of Object.entries(parsed)) {
        const previous = process.env[key];
        if (!envFileKeys.has(key)) {
            added.push(key);
            process.env[key] = value;
        } else if (previous !== value) {
            updated.push(key);
            process.env[key] = value;
        } else {
            unchanged.push(key);
        }
    }

    for (const key of envFileKeys) {
        if (!newKeys.has(key)) {
            removed.push(key);
            delete process.env[key];
        }
    }

    envFileKeys = newKeys;
    return { added, updated, removed, unchanged };
}

// Minimal `.env` parser. Supports comments (#), KEY=VALUE, single- or
// double-quoted values, blank lines, and whitespace around `=`. Does not
// implement variable interpolation or multiline values, so keep .env files
// straightforward.
export function parseEnvFile(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const eq = line.indexOf("=");
        if (eq === -1) continue;

        const key = line.slice(0, eq).trim();
        if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

        let value = line.slice(eq + 1).trim();

        // Strip an inline comment, but only when not inside quotes.
        if (!value.startsWith('"') && !value.startsWith("'")) {
            const hash = value.indexOf(" #");
            if (hash !== -1) value = value.slice(0, hash).trim();
        }

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        out[key] = value;
    }
    return out;
}
