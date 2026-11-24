import { execFileSync } from "node:child_process";

/**
 * Kill a process and every descendant it started. Wrapper processes such as
 * `npx.cmd`, shells, and `node spawn`-style supervisors mean killing only the
 * direct process can leave the real child running.
 *
 * Returns false when the process was already gone or could not be killed; the
 * caller's cleanup is best effort, so errors are swallowed rather than thrown.
 */
export function killProcessTree(pid: number): boolean {
    try {
        if (process.platform === "win32") {
            execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
                stdio: "ignore",
            });
        } else {
            process.kill(pid, "SIGKILL");
        }
        return true;
    } catch {
        // Process might already be dead.
        return false;
    }
}
