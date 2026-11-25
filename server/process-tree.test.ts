import { expect, test } from "bun:test";

import { killProcessTree } from "./process-tree";

function isRunning(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitUntilStopped(pid: number) {
    const deadline = Date.now() + 3_000;
    while (isRunning(pid) && Date.now() < deadline) {
        await Bun.sleep(20);
    }
    return !isRunning(pid);
}

function spawnIdle() {
    return Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 60000)"], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
    });
}

test("kills a live process", async () => {
    const child = spawnIdle();

    try {
        expect(isRunning(child.pid)).toBe(true);

        expect(killProcessTree(child.pid)).toBe(true);
        await child.exited;
        expect(await waitUntilStopped(child.pid)).toBe(true);
    } finally {
        if (isRunning(child.pid)) {
            try {
                process.kill(child.pid);
            } catch {
                // Already gone.
            }
        }
    }
});

test("returns false for a process that is already gone", async () => {
    const child = Bun.spawn([process.execPath, "-e", "process.exit(0)"], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
    });
    const pid = child.pid;

    await child.exited;
    expect(isRunning(pid)).toBe(false);

    expect(() => killProcessTree(pid)).not.toThrow();
    expect(killProcessTree(pid)).toBe(false);
});
