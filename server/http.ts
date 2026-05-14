import { randomUUID } from "node:crypto";
import { rm, rename } from "node:fs/promises";
import { extname } from "node:path";

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
    const tempPath = `${pathname}.${process.pid}.${randomUUID()}.tmp`;

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

    console.warn(`Invalid SMILEYCHAT_PORT "${value}". Falling back to 4173.`);
    return 4173;
}

export function contentTypeFor(pathname: string) {
    const extension = extname(pathname);

    if (extension === ".html") {
        return "text/html; charset=utf-8";
    }

    if (extension === ".js") {
        return "text/javascript; charset=utf-8";
    }

    if (extension === ".css") {
        return "text/css; charset=utf-8";
    }

    if (extension === ".svg") {
        return "image/svg+xml";
    }

    if (extension === ".png") {
        return "image/png";
    }

    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }

    if (extension === ".webp") {
        return "image/webp";
    }

    if (extension === ".json") {
        return "application/json; charset=utf-8";
    }

    return "application/octet-stream";
}
