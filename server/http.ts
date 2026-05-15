import { rm, rename } from "node:fs/promises";

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
    const tempPath = `${pathname}.${process.pid}.${Bun.randomUUIDv7()}.tmp`;

    try {
        await Bun.write(tempPath, `${JSON.stringify(data, null, 2)}\n`);
        await rename(tempPath, pathname);
    } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
    }
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

export function parsePort(value: string | undefined) {
    if (!value) {
        return 4173;
    }

    const portNumber = Number(value);

    if (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535) {
        return portNumber;
    }

    console.warn(`Invalid 'SCYLLACHAT_API_PORT' "${value}". Falling back to 4173.`);
    return 4173;
}
