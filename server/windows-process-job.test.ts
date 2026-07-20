import { expect, test } from "bun:test";
import { WindowsKillOnCloseJob } from "./windows-process-job";

const windowsTest = process.platform === "win32" ? test : test.skip;

function isRunning(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitUntilStopped(pid: number) {
    const deadline = Date.now() + 2_000;
    while (isRunning(pid) && Date.now() < deadline) {
        await Bun.sleep(20);
    }
}

windowsTest("a kill-on-close job terminates its assigned process", async () => {
    const job = WindowsKillOnCloseJob.create();
    expect(job).toBeDefined();

    const child = Bun.spawn(
        [
            process.execPath,
            "-e",
            `
                await Bun.sleep(100);
                const descendant = Bun.spawn(
                    [process.execPath, "-e", "setInterval(() => {}, 60000)"],
                    { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
                );
                console.log(descendant.pid);
                setInterval(() => {}, 60000);
            `,
        ],
        {
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
        },
    );
    let descendantPid = 0;

    try {
        expect(job!.assign(child.pid)).toBe(true);
        const read = await child.stdout.getReader().read();
        descendantPid = Number.parseInt(new TextDecoder().decode(read.value).trim(), 10);
        expect(Number.isSafeInteger(descendantPid)).toBe(true);

        job!.close();

        await expect(child.exited).resolves.toBeGreaterThanOrEqual(0);
        await waitUntilStopped(descendantPid);
        expect(isRunning(descendantPid)).toBe(false);
    } finally {
        child.kill();
        if (descendantPid && isRunning(descendantPid)) process.kill(descendantPid);
        job?.close();
    }
});

windowsTest(
    "Windows closes the job and its process when the owner exits abruptly",
    async () => {
        const ownerCode = `
        const { WindowsKillOnCloseJob } = await import("./server/windows-process-job.ts");
        const job = WindowsKillOnCloseJob.create();
        const child = Bun.spawn(
            [process.execPath, "-e", "setInterval(() => {}, 60000)"],
            { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
        );
        if (!job?.assign(child.pid)) process.exit(2);
        console.log(child.pid);
        await Bun.sleep(50);
        process.exit(0);
    `;
        const owner = Bun.spawn([process.execPath, "-e", ownerCode], {
            cwd: process.cwd(),
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
        });

        const [exitCode, output, errorOutput] = await Promise.all([
            owner.exited,
            new Response(owner.stdout).text(),
            new Response(owner.stderr).text(),
        ]);
        expect(exitCode, errorOutput).toBe(0);

        const childPid = Number.parseInt(output.trim(), 10);
        expect(Number.isSafeInteger(childPid)).toBe(true);

        try {
            await waitUntilStopped(childPid);
            expect(isRunning(childPid)).toBe(false);
        } finally {
            if (isRunning(childPid)) process.kill(childPid);
        }
    },
);
