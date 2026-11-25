import { afterEach, expect, test } from "bun:test";
import {
    mkdir,
    mkdtemp,
    readdir,
    realpath,
    rename,
    rm,
    stat,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { getRecentLogs } from "./logger";

import {
    getPluginServerSignature,
    getPluginServerStatus,
    handlePluginServerRequest,
    startPluginServer,
    stopAllPluginServers,
    stopPluginServer,
} from "./plugin-server-runtime";

const roots: string[] = [];
let pluginCounter = 0;

afterEach(async () => {
    await stopAllPluginServers();
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
});

function uniqueId(name: string) {
    pluginCounter += 1;
    return `${name}-${process.pid}-${pluginCounter}`;
}

async function makePlugin(pluginId: string, files: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), "smileychat-plugin-runtime-"));
    roots.push(root);
    const pluginRoot = join(root, pluginId);
    await mkdir(pluginRoot, { recursive: true });

    for (const [name, content] of Object.entries(files)) {
        const target = join(pluginRoot, name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
    }

    return { root, pluginRoot };
}

function isRunning(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitUntilDead(pid: number, timeoutMs = 3_000) {
    const deadline = Date.now() + timeoutMs;
    while (isRunning(pid) && Date.now() < deadline) {
        await Bun.sleep(25);
    }
    return !isRunning(pid);
}

async function exists(path: string) {
    return Boolean(await stat(path).catch(() => null));
}

async function readText(path: string) {
    return Bun.file(path)
        .text()
        .catch(() => "");
}

function callServer(pluginId: string, subpath = "/") {
    const request = new Request(
        `http://localhost/api/plugins/${pluginId}/server${subpath === "/" ? "" : subpath}`,
    );
    return handlePluginServerRequest(pluginId, request, subpath);
}

async function readPid(pluginId: string) {
    const response = await callServer(pluginId);
    expect(response.status).toBe(200);
    const pid = Number.parseInt(await response.text(), 10);
    expect(Number.isSafeInteger(pid)).toBe(true);
    return pid;
}

const spawnIdleFixture = `
export async function activate(host) {
    const child = host.spawn(process.execPath, ["-e", "setInterval(() => {}, 500)"]);
    return {
        handle() {
            return new Response(String(child.pid));
        },
    };
}
`;

test("sweeps stale runtime copies before starting", async () => {
    const pluginId = uniqueId("stale");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
export async function activate() {
    return {};
}
`,
    });
    const pluginRuntimeRoot = join(
        tmpdir(),
        "smileychat-plugin-runtime",
        pluginId.replace(/[^A-Za-z0-9._-]/g, "_"),
    );
    const staleDir = join(pluginRuntimeRoot, "1-1");
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, "leftover.js"), "export {};\n", "utf8");

    try {
        const status = await startPluginServer({
            pluginId,
            pluginRoot,
            serverMain: "server.js",
            signature: "sig-stale",
        });
        expect(status.state).toBe("running");

        expect(await exists(join(staleDir, "leftover.js"))).toBe(false);
        const entries = await readdir(pluginRuntimeRoot);
        expect(entries).toHaveLength(1);
    } finally {
        await stopPluginServer(pluginId);
        await rm(pluginRuntimeRoot, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
});

test("does not load a plugin module until the server starts", async () => {
    const pluginId = uniqueId("lazy");
    const { pluginRoot } = await makePlugin(pluginId, {});
    const marker = join(pluginRoot, "imported.txt");
    await writeFile(
        join(pluginRoot, "server.js"),
        `import { writeFileSync } from "node:fs";

writeFileSync(${JSON.stringify(marker)}, "1");

export async function activate() {
    return {};
}
`,
        "utf8",
    );

    expect(await exists(marker)).toBe(false);
    expect(getPluginServerStatus(pluginId)).toEqual({
        state: "stopped",
        processCount: 0,
    });

    const status = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-lazy",
    });

    expect(status.state).toBe("running");
    expect(await exists(marker)).toBe(true);
});

test("activates a plugin server, routes requests, and disposes once on stop", async () => {
    const pluginId = uniqueId("route");
    const { pluginRoot } = await makePlugin(pluginId, {});
    const disposeLog = join(pluginRoot, "dispose.log");
    await writeFile(
        join(pluginRoot, "server.js"),
        `import { appendFileSync } from "node:fs";

export async function activate(host) {
    return {
        handle(request, subpath) {
            return Response.json({
                pluginId: host.pluginId,
                dataDir: host.dataDir,
                method: request.method,
                subpath,
            });
        },
        dispose() {
            appendFileSync(${JSON.stringify(disposeLog)}, "x");
        },
    };
}
`,
        "utf8",
    );

    const status = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-route",
    });

    expect(status.state).toBe("running");
    expect(status.processCount).toBe(0);
    expect(typeof status.startedAt).toBe("string");
    expect(status.error).toBeUndefined();
    expect(getPluginServerSignature(pluginId)).toBe("sig-route");

    const dataDir = join(pluginRoot, "data");
    expect(await exists(dataDir)).toBe(true);

    const response = await callServer(pluginId, "/ping?x=1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.pluginId).toBe(pluginId);
    expect(body.method).toBe("GET");
    expect(body.subpath).toBe("/ping?x=1");
    expect(await realpath(String(body.dataDir))).toBe(await realpath(dataDir));

    await stopPluginServer(pluginId);

    expect(getPluginServerStatus(pluginId)).toEqual({
        state: "stopped",
        processCount: 0,
    });
    expect(getPluginServerSignature(pluginId)).toBeUndefined();
    expect(await readText(join(pluginRoot, "dispose.log"))).toBe("x");

    // Stopping again must stay a no-op, including dispose staying single-shot.
    await stopPluginServer(pluginId);
    expect(await readText(join(pluginRoot, "dispose.log"))).toBe("x");

    const notRunning = await callServer(pluginId);
    expect(notRunning.status).toBe(503);
    expect(await notRunning.json()).toEqual({ error: "Plugin server is not running." });
});

test("returns 404 when a running plugin server has no request handler", async () => {
    const pluginId = uniqueId("no-handle");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
export async function activate() {
    return { dispose() {} };
}
`,
    });

    const status = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-no-handle",
    });
    expect(status.state).toBe("running");

    const response = await callServer(pluginId, "/anything");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
        error: "Plugin server has no request handler.",
    });
});

test("logs plugin server messages without a client-telemetry prefix", async () => {
    const pluginId = uniqueId("log-prefix");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
export async function activate(host) {
    host.logger.warn("hello from the plugin");
    throw new Error("activate exploded after logging");
}
`,
    });

    const status = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-log-prefix",
    });
    expect(status.state).toBe("error");

    // The `plugins` filter hides messages that start with "[" unless client
    // telemetry is enabled, so runtime lines must not use a bracket prefix.
    const lines = getRecentLogs().filter(
        (entry) => entry.subsystem === "plugins" && entry.message.includes(pluginId),
    );
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
        expect(line.message.startsWith("[")).toBe(false);
        expect(line.message.startsWith(`Plugin server ${pluginId}:`)).toBe(true);
    }

    expect(
        lines.some(
            (line) => line.message === `Plugin server ${pluginId}: hello from the plugin`,
        ),
    ).toBe(true);
});

test("kills processes a plugin server spawned when it stops", async () => {
    const pluginId = uniqueId("kill");
    const { pluginRoot } = await makePlugin(pluginId, { "server.js": spawnIdleFixture });

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-kill",
    });

    const pid = await readPid(pluginId);
    expect(isRunning(pid)).toBe(true);
    expect(getPluginServerStatus(pluginId).processCount).toBe(1);

    await stopPluginServer(pluginId);

    expect(await waitUntilDead(pid)).toBe(true);
    expect(getPluginServerStatus(pluginId).processCount).toBe(0);
});

test("stops the previous instance before starting the same plugin again", async () => {
    const pluginId = uniqueId("restart");
    const { pluginRoot } = await makePlugin(pluginId, { "server.js": spawnIdleFixture });

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-v1",
    });
    const firstPid = await readPid(pluginId);

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-v2",
    });
    const secondPid = await readPid(pluginId);

    expect(secondPid).not.toBe(firstPid);
    expect(await waitUntilDead(firstPid)).toBe(true);
    expect(isRunning(secondPid)).toBe(true);
    expect(getPluginServerSignature(pluginId)).toBe("sig-v2");
    expect(getPluginServerStatus(pluginId).processCount).toBe(1);
});

test("isolates an activate() failure and keeps other plugin servers running", async () => {
    const badId = uniqueId("boom");
    const goodId = uniqueId("healthy");
    const bad = await makePlugin(badId, {
        "server.js": `
export async function activate() {
    throw new Error("activate exploded");
}
`,
    });
    const good = await makePlugin(goodId, {
        "server.js": `
export async function activate() {
    return {
        handle(_request, subpath) {
            return new Response("ok:" + subpath);
        },
    };
}
`,
    });

    const failed = await startPluginServer({
        pluginId: badId,
        pluginRoot: bad.pluginRoot,
        serverMain: "server.js",
        signature: "sig-bad",
    });

    expect(failed.state).toBe("error");
    expect(failed.error).toContain("activate exploded");
    expect(failed.processCount).toBe(0);
    expect(getPluginServerSignature(badId)).toBe("sig-bad");
    expect(getPluginServerStatus(badId).state).toBe("error");

    const failedRequest = await callServer(badId);
    expect(failedRequest.status).toBe(503);
    expect(await failedRequest.json()).toEqual({ error: "activate exploded" });

    const started = await startPluginServer({
        pluginId: goodId,
        pluginRoot: good.pluginRoot,
        serverMain: "server.js",
        signature: "sig-good",
    });
    expect(started.state).toBe("running");

    const response = await callServer(goodId, "/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok:/health");
});

test("kills processes spawned before a failing activate()", async () => {
    const pluginId = uniqueId("spawn-boom");
    const { pluginRoot } = await makePlugin(pluginId, {});
    const pidFile = join(pluginRoot, "pid.txt");
    await writeFile(
        join(pluginRoot, "server.js"),
        `import { writeFileSync } from "node:fs";

export async function activate(host) {
    const child = host.spawn(process.execPath, ["-e", "setInterval(() => {}, 500)"]);
    writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    throw new Error("activate exploded after spawn");
}
`,
        "utf8",
    );

    const status = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-spawn-boom",
    });

    expect(status.state).toBe("error");
    expect(status.error).toContain("activate exploded after spawn");

    const pid = Number.parseInt(await readText(join(pluginRoot, "pid.txt")), 10);
    expect(Number.isSafeInteger(pid)).toBe(true);
    expect(await waitUntilDead(pid)).toBe(true);
    expect(getPluginServerStatus(pluginId).processCount).toBe(0);
});

test("returns 500 for a failing handler and keeps serving", async () => {
    const pluginId = uniqueId("handler");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
export async function activate() {
    let calls = 0;
    return {
        handle() {
            calls += 1;
            if (calls === 1) throw new Error("handler exploded");
            if (calls === 2) return "not a response";
            return new Response("ok");
        },
    };
}
`,
    });

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-handler",
    });

    const thrown = await callServer(pluginId);
    expect(thrown.status).toBe(500);
    expect(await thrown.json()).toEqual({ error: "Plugin server request failed." });
    expect(getPluginServerStatus(pluginId).lastRequestError).toContain(
        "handler exploded",
    );

    const invalid = await callServer(pluginId);
    expect(invalid.status).toBe(500);
    expect(getPluginServerStatus(pluginId).state).toBe("running");

    const recovered = await callServer(pluginId);
    expect(recovered.status).toBe(200);
    expect(await recovered.text()).toBe("ok");
    expect(getPluginServerStatus(pluginId).state).toBe("running");
});

test("rejects server entries outside the plugin folder", async () => {
    const pluginId = uniqueId("escape");
    const { root, pluginRoot } = await makePlugin(pluginId, {});
    const marker = join(root, "escape-imported.txt");
    const escapePath = join(root, "escape.js");

    await writeFile(
        escapePath,
        `import { writeFileSync } from "node:fs";\n` +
            `writeFileSync(${JSON.stringify(marker)}, "1");\n` +
            "export async function activate() {}\n",
        "utf8",
    );

    const relative = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "../escape.js",
        signature: "sig-escape-1",
    });
    expect(relative.state).toBe("error");
    expect(relative.error).toContain("outside the plugin folder");
    expect(await exists(marker)).toBe(false);

    const absolute = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: escapePath,
        signature: "sig-escape-2",
    });
    expect(absolute.state).toBe("error");
    expect(absolute.error).toContain("must be relative");
    expect(await exists(marker)).toBe(false);

    const missing = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-escape-3",
    });
    expect(missing.state).toBe("error");
    expect(missing.error).toContain("does not exist");

    // A link inside the folder that resolves outside of it is rejected too.
    try {
        await symlink(
            root,
            join(pluginRoot, "linked"),
            process.platform === "win32" ? "junction" : "dir",
        );
    } catch {
        return;
    }

    const linked = await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "linked/escape.js",
        signature: "sig-escape-4",
    });
    expect(linked.state).toBe("error");
    expect(linked.error).toContain("outside the plugin folder");
    expect(await exists(marker)).toBe(false);
});

test("refuses to spawn after the plugin server is stopped", async () => {
    const pluginId = uniqueId("late-spawn");
    const { pluginRoot } = await makePlugin(pluginId, {});
    const spawnLog = join(pluginRoot, "spawn.txt");
    await writeFile(
        join(pluginRoot, "server.js"),
        `import { writeFileSync } from "node:fs";

export async function activate(host) {
    return {
        dispose() {
            try {
                host.spawn(process.execPath, ["-e", "setInterval(() => {}, 500)"]);
                writeFileSync(${JSON.stringify(spawnLog)}, "spawned");
            } catch (error) {
                writeFileSync(${JSON.stringify(spawnLog)}, String(error.message));
            }
        },
    };
}
`,
        "utf8",
    );

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-late-spawn",
    });
    await stopPluginServer(pluginId);

    expect(await readText(join(pluginRoot, "spawn.txt"))).toBe(
        "Plugin server is stopped.",
    );
    expect(getPluginServerStatus(pluginId).processCount).toBe(0);
});

test("runs rewritten plugin code after a restart", async () => {
    const pluginId = uniqueId("reload");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
export async function activate() {
    return { handle: () => new Response("version-1") };
}
`,
    });

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-reload-1",
    });
    expect(await (await callServer(pluginId)).text()).toBe("version-1");

    await writeFile(
        join(pluginRoot, "server.js"),
        `export async function activate() {
    return { handle: () => new Response("version-2") };
}
`,
        "utf8",
    );

    await startPluginServer({
        pluginId,
        pluginRoot,
        serverMain: "server.js",
        signature: "sig-reload-2",
    });

    const response = await callServer(pluginId);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("version-2");
    expect(getPluginServerSignature(pluginId)).toBe("sig-reload-2");
});

test("drains child output so a chatty process cannot block", async () => {
    const pluginId = uniqueId("logs");
    const { pluginRoot } = await makePlugin(pluginId, {
        "server.js": `
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export async function activate(host) {
    const script = join(host.dataDir, "writer.js");
    writeFileSync(
        script,
        "const line = 'x'.repeat(2000) + '\\\\n';\\n" +
            "for (let i = 0; i < 400; i += 1) process.stdout.write(line);\\n" +
            "require('node:fs').writeFileSync(process.env.SMILEY_TEST_MARKER, 'done');\\n" +
            "setInterval(() => {}, 500);\\n",
    );
    writeFileSync(join(host.dataDir, "marker-path.txt"), process.env.SMILEY_TEST_MARKER);
    host.spawn(process.execPath, [script]);
    return {};
}
`,
    });
    const marker = join(pluginRoot, "child-finished.txt");
    process.env.SMILEY_TEST_MARKER = marker;

    try {
        const status = await startPluginServer({
            pluginId,
            pluginRoot,
            serverMain: "server.js",
            signature: "sig-logs",
        });
        expect(status.state).toBe("running");

        const deadline = Date.now() + 3_000;
        while (!(await exists(marker)) && Date.now() < deadline) {
            await Bun.sleep(25);
        }

        // 400 lines of 2000 bytes overflow the pipe buffer, so this only
        // finishes when the runtime keeps reading stdout.
        expect(await exists(marker)).toBe(true);
    } finally {
        delete process.env.SMILEY_TEST_MARKER;
        await stopPluginServer(pluginId);
    }
});

test.skipIf(process.platform !== "win32")(
    "releases the plugin folder right after stop, even with a child cwd inside it",
    async () => {
        const pluginId = uniqueId("rename");
        const { root, pluginRoot } = await makePlugin(pluginId, {
            "server.js": `
export async function activate(host) {
    host.spawn(process.execPath, ["-e", "setInterval(() => {}, 500)"], {
        cwd: host.dataDir,
    });
    return {};
}
`,
        });

        const status = await startPluginServer({
            pluginId,
            pluginRoot,
            serverMain: "server.js",
            signature: "sig-rename",
        });
        expect(status.state).toBe("running");
        expect(getPluginServerStatus(pluginId).processCount).toBe(1);

        await stopPluginServer(pluginId);

        const moved = join(root, `moved-${pluginId}`);
        const deadline = Date.now() + 3_000;
        let lastError: unknown;

        while (Date.now() < deadline) {
            try {
                await rename(pluginRoot, moved);
                lastError = undefined;
                break;
            } catch (error) {
                lastError = error;
                await Bun.sleep(50);
            }
        }

        if (lastError) throw lastError;
        expect(await exists(join(moved, "server.js"))).toBe(true);
    },
    20_000,
);
