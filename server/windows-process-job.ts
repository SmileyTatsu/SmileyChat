import { dlopen, FFIType, type Pointer } from "bun:ffi";

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
const PROCESS_TERMINATE = 0x0001;
const PROCESS_SET_QUOTA = 0x0100;

type Kernel32 = ReturnType<typeof openKernel32>;

function openKernel32() {
    return dlopen("kernel32.dll", {
        CreateJobObjectW: {
            args: [FFIType.ptr, FFIType.ptr],
            returns: FFIType.ptr,
        },
        SetInformationJobObject: {
            args: [FFIType.ptr, FFIType.uint32_t, FFIType.ptr, FFIType.uint32_t],
            returns: FFIType.int32_t,
        },
        OpenProcess: {
            args: [FFIType.uint32_t, FFIType.int32_t, FFIType.uint32_t],
            returns: FFIType.ptr,
        },
        AssignProcessToJobObject: {
            args: [FFIType.ptr, FFIType.ptr],
            returns: FFIType.int32_t,
        },
        CloseHandle: {
            args: [FFIType.ptr],
            returns: FFIType.int32_t,
        },
        GetLastError: {
            returns: FFIType.uint32_t,
        },
    } as const);
}

/**
 * Owns a Windows Job Object configured to terminate every assigned process when
 * its handle closes. Windows closes the handle even if SmileyChat is terminated
 * without giving JavaScript a chance to run its shutdown handlers.
 */
export class WindowsKillOnCloseJob {
    private closed = false;

    private constructor(
        private readonly kernel32: Kernel32,
        private readonly handle: Pointer,
    ) {}

    static create() {
        if (process.platform !== "win32") return undefined;

        const kernel32 = openKernel32();
        const handle = kernel32.symbols.CreateJobObjectW(null, null);
        if (!handle) {
            const error = kernel32.symbols.GetLastError();
            kernel32.close();
            throw new Error(`CreateJobObjectW failed with Windows error ${error}.`);
        }

        // JOBOBJECT_EXTENDED_LIMIT_INFORMATION is 144 bytes on 64-bit Windows.
        // LimitFlags is the DWORD at offset 16 in its first member,
        // JOBOBJECT_BASIC_LIMIT_INFORMATION.
        const info = new Uint8Array(144);
        new DataView(info.buffer).setUint32(16, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, true);

        if (
            !kernel32.symbols.SetInformationJobObject(
                handle,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                info,
                info.byteLength,
            )
        ) {
            const error = kernel32.symbols.GetLastError();
            kernel32.symbols.CloseHandle(handle);
            kernel32.close();
            throw new Error(
                `SetInformationJobObject failed with Windows error ${error}.`,
            );
        }

        return new WindowsKillOnCloseJob(kernel32, handle);
    }

    assign(pid: number) {
        if (this.closed) return false;

        const processHandle = this.kernel32.symbols.OpenProcess(
            PROCESS_TERMINATE | PROCESS_SET_QUOTA,
            0,
            pid,
        );
        if (!processHandle) return false;

        try {
            return Boolean(
                this.kernel32.symbols.AssignProcessToJobObject(
                    this.handle,
                    processHandle,
                ),
            );
        } finally {
            this.kernel32.symbols.CloseHandle(processHandle);
        }
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.kernel32.symbols.CloseHandle(this.handle);
        this.kernel32.close();
    }
}

let sharedJob: WindowsKillOnCloseJob | null | undefined;

/**
 * Place a process and its future descendants in SmileyChat's kill-on-close job.
 * Returns false when the platform cannot provide this protection, allowing the
 * caller's normal taskkill/transport cleanup to remain the fallback.
 */
export function assignProcessToSmileyChatJob(pid: number) {
    if (process.platform !== "win32") return false;

    if (sharedJob === undefined) {
        try {
            sharedJob = WindowsKillOnCloseJob.create() ?? null;
        } catch (error) {
            sharedJob = null;
            console.warn("[mcp] Windows process cleanup job is unavailable:", error);
        }
    }

    if (!sharedJob) return false;

    const assigned = sharedJob.assign(pid);
    if (!assigned) {
        console.warn(
            `[mcp] Could not add process ${pid} to the Windows cleanup job; ` +
                "disconnect and signal-based cleanup will remain active.",
        );
    }
    return assigned;
}
