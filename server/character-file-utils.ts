import { mkdir, rename, stat } from "node:fs/promises";
import { extname, join } from "node:path";

export async function moveToUniquePath(
    sourcePath: string,
    targetDir: string,
    fileName: string,
) {
    await mkdir(targetDir, { recursive: true });

    let targetPath = join(targetDir, fileName);
    const extension = extname(fileName);
    const baseName = fileName.slice(0, fileName.length - extension.length);
    let counter = 1;

    while (await pathExists(targetPath)) {
        targetPath = join(targetDir, `${baseName}-${counter}${extension}`);
        counter += 1;
    }

    await rename(sourcePath, targetPath);
    return targetPath;
}

export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }

    return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
            (key) =>
                `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
        )
        .join(",")}}`;
}

async function pathExists(pathname: string) {
    try {
        await stat(pathname);
        return true;
    } catch {
        return false;
    }
}
