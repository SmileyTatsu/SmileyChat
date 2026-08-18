import { Glob } from "bun";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { moveToUniquePath } from "./character-file-utils";
import { writeJsonAtomic } from "./http";

type FileBackedIndexOptions<TIndex> = {
    indexPath: string;
    normalizeIndex: (value: unknown) => TIndex;
    repairIndex: (index: TIndex) => Promise<TIndex>;
    rebuildIndex: () => Promise<TIndex>;
    rebuildInvalidIndex?: () => Promise<TIndex>;
};

type DiscoverJsonFilesOptions<TEntity> = {
    directory: string;
    orphanedDirectory: string;
    normalizeFile: (value: unknown, fileName: string) => TEntity | undefined;
    pattern?: string;
};

type ExistingIndexReadOptions<TIndex> = Pick<
    FileBackedIndexOptions<TIndex>,
    "indexPath" | "normalizeIndex" | "repairIndex"
> & {
    lastModified: number;
    rebuildInvalidIndex: () => Promise<TIndex>;
};

type CachedFileBackedIndex = {
    lastModified: number;
    index: unknown;
};

const fileBackedIndexCache = new Map<string, CachedFileBackedIndex>();
const fileBackedIndexReads = new Map<string, Promise<unknown>>();
const collectionReadConcurrency = 8;

export async function readFileBackedIndex<TIndex>({
    indexPath,
    normalizeIndex,
    repairIndex,
    rebuildIndex,
    rebuildInvalidIndex = rebuildIndex,
}: FileBackedIndexOptions<TIndex>): Promise<TIndex> {
    const existingFile = await fileStat(indexPath);

    if (existingFile) {
        const cached = fileBackedIndexCache.get(indexPath);

        if (cached?.lastModified === existingFile.mtimeMs) {
            return cached.index as TIndex;
        }

        const pendingRead = fileBackedIndexReads.get(indexPath);

        if (pendingRead) {
            return (await pendingRead) as TIndex;
        }

        const read = readAndRepairExistingIndex({
            indexPath,
            lastModified: existingFile.mtimeMs,
            normalizeIndex,
            repairIndex,
            rebuildInvalidIndex,
        });

        fileBackedIndexReads.set(indexPath, read);

        try {
            return (await read) as TIndex;
        } finally {
            if (fileBackedIndexReads.get(indexPath) === read) {
                fileBackedIndexReads.delete(indexPath);
            }
        }
    }

    const pendingRead = fileBackedIndexReads.get(indexPath);

    if (pendingRead) {
        return (await pendingRead) as TIndex;
    }

    const read = rebuildIndex();
    fileBackedIndexReads.set(indexPath, read);

    try {
        const index = await read;
        const latestFile = await fileStat(indexPath);
        const cachedIndex = cacheIndex(index);

        if (latestFile) {
            fileBackedIndexCache.set(indexPath, {
                lastModified: latestFile.mtimeMs,
                index: cachedIndex,
            });
        }

        return cachedIndex;
    } finally {
        if (fileBackedIndexReads.get(indexPath) === read) {
            fileBackedIndexReads.delete(indexPath);
        }
    }
}

export async function writeFileBackedIndex<TIndex>(indexPath: string, index: TIndex) {
    await writeJsonAtomic(indexPath, index);

    const writtenFile = await fileStat(indexPath);

    if (writtenFile) {
        fileBackedIndexCache.set(indexPath, {
            lastModified: writtenFile.mtimeMs,
            index: cacheIndex(index),
        });
    } else {
        fileBackedIndexCache.delete(indexPath);
    }
}

async function readAndRepairExistingIndex<TIndex>({
    indexPath,
    lastModified,
    normalizeIndex,
    repairIndex,
    rebuildInvalidIndex,
}: ExistingIndexReadOptions<TIndex>): Promise<TIndex> {
    try {
        const index = await repairIndex(normalizeIndex(await Bun.file(indexPath).json()));
        const latestFile = await fileStat(indexPath);
        const cachedIndex = cacheIndex(index);

        fileBackedIndexCache.set(indexPath, {
            lastModified: latestFile?.mtimeMs ?? lastModified,
            index: cachedIndex,
        });

        return cachedIndex;
    } catch {
        const index = await rebuildInvalidIndex();
        const latestFile = await fileStat(indexPath);
        const cachedIndex = cacheIndex(index);

        if (latestFile) {
            fileBackedIndexCache.set(indexPath, {
                lastModified: latestFile.mtimeMs,
                index: cachedIndex,
            });
        } else {
            fileBackedIndexCache.delete(indexPath);
        }

        return cachedIndex;
    }
}

async function fileStat(pathname: string) {
    try {
        return await stat(pathname);
    } catch {
        return undefined;
    }
}

function cacheIndex<TIndex>(index: TIndex): TIndex {
    return deepFreeze(structuredClone(index));
}

function deepFreeze<TValue>(value: TValue): TValue {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
    }

    Object.freeze(value);

    for (const child of Object.values(value)) {
        deepFreeze(child);
    }

    return value;
}

export async function readExistingIdsInOrder(
    ids: string[],
    filePathForId: (id: string) => string,
) {
    const results = await mapWithConcurrency(
        ids,
        collectionReadConcurrency,
        async (id) => ({
            id,
            exists: await Bun.file(filePathForId(id)).exists(),
        }),
    );

    return results.filter((result) => result.exists).map((result) => result.id);
}

export async function readEntitiesFromIds<TEntity>(
    ids: string[],
    readById: (id: string) => Promise<TEntity | undefined>,
): Promise<TEntity[]> {
    const entities = await mapWithConcurrency(ids, collectionReadConcurrency, readById);
    return entities.filter(isDefined);
}

async function mapWithConcurrency<TInput, TOutput>(
    values: TInput[],
    concurrency: number,
    mapper: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
    const results = new Array<TOutput>(values.length);
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, values.length);

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (nextIndex < values.length) {
                const index = nextIndex;
                nextIndex += 1;
                results[index] = await mapper(values[index]);
            }
        }),
    );

    return results;
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
    return value !== undefined;
}

export async function discoverJsonFiles<TEntity>({
    directory,
    orphanedDirectory,
    normalizeFile,
    pattern = "*.json",
}: DiscoverJsonFilesOptions<TEntity>) {
    const entities: TEntity[] = [];
    const glob = new Glob(pattern);

    for await (const fileName of glob.scan(directory)) {
        const filePath = join(directory, fileName);

        try {
            const entity = normalizeFile(await Bun.file(filePath).json(), fileName);

            if (entity) {
                entities.push(entity);
            }
        } catch {
            await moveToUniquePath(filePath, orphanedDirectory, fileName);
        }
    }

    return entities;
}
