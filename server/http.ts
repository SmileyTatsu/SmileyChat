import { rm, rename } from "node:fs/promises";

const writeQueues = new Map<string, Promise<void>>();
const transientRenameErrorCodes = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);
const renameRetryDelaysMs = [10, 25, 50, 100, 200, 400, 800];

export class HttpError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
        this.name = "HttpError";
    }
}

export class BadRequestError extends HttpError {
    constructor(message: string) {
        super(400, message);
        this.name = "BadRequestError";
    }
}

export class NotFoundError extends HttpError {
    constructor(message: string) {
        super(404, message);
        this.name = "NotFoundError";
    }
}

export async function writeJsonAtomic(pathname: string, data: unknown) {
    const previousWrite = writeQueues.get(pathname) ?? Promise.resolve();
    const nextWrite = previousWrite
        .catch(() => undefined)
        .then(() => writeJsonAtomicNow(pathname, data));

    writeQueues.set(pathname, nextWrite);

    try {
        await nextWrite;
    } finally {
        if (writeQueues.get(pathname) === nextWrite) {
            writeQueues.delete(pathname);
        }
    }
}

async function writeJsonAtomicNow(pathname: string, data: unknown) {
    const tempPath = `${pathname}.${process.pid}.${Bun.randomUUIDv7()}.tmp`;

    try {
        await Bun.write(tempPath, `${JSON.stringify(data, null, 2)}\n`);
        await renameWithRetry(tempPath, pathname);
    } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
    }
}

async function renameWithRetry(sourcePath: string, targetPath: string) {
    for (let attempt = 0; attempt <= renameRetryDelaysMs.length; attempt += 1) {
        try {
            await rename(sourcePath, targetPath);
            return;
        } catch (error) {
            if (attempt >= renameRetryDelaysMs.length || !isTransientRenameError(error)) {
                throw error;
            }

            await Bun.sleep(renameRetryDelaysMs[attempt]);
        }
    }
}

function isTransientRenameError(error: unknown) {
    return (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        transientRenameErrorCodes.has(error.code)
    );
}

export function json(data: unknown, status = 200) {
    return Response.json(data, { status });
}

export async function readJsonBody(request: Request) {
    try {
        return await request.json();
    } catch {
        throw new BadRequestError("Invalid JSON body.");
    }
}
