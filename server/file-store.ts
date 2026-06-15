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
            return cloneIndex(cached.index) as TIndex;
        }

        const pendingRead = fileBackedIndexReads.get(indexPath);

        if (pendingRead) {
            return cloneIndex(await pendingRead) as TIndex;
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
            return cloneIndex(await read) as TIndex;
        } finally {
            if (fileBackedIndexReads.get(indexPath) === read) {
                fileBackedIndexReads.delete(indexPath);
            }
        }
    }

    const pendingRead = fileBackedIndexReads.get(indexPath);

    if (pendingRead) {
        return cloneIndex(await pendingRead) as TIndex;
    }

    const read = rebuildIndex();
    fileBackedIndexReads.set(indexPath, read);

    try {
        const index = await read;
        const latestFile = await fileStat(indexPath);

        if (latestFile) {
            fileBackedIndexCache.set(indexPath, {
                lastModified: latestFile.mtimeMs,
                index: cloneIndex(index),
            });
        }

        return cloneIndex(index);
    } finally {
        if (fileBackedIndexReads.get(indexPath) === read) {
            fileBackedIndexReads.delete(indexPath);
        }
    }
}

export async function writeFileBackedIndex<TIndex>(indexPath: string, index: TIndex) {
    fileBackedIndexCache.delete(indexPath);
    await writeJsonAtomic(indexPath, index);
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

        fileBackedIndexCache.set(indexPath, {
            lastModified: latestFile?.mtimeMs ?? lastModified,
            index: cloneIndex(index),
        });

        return index;
    } catch {
        const index = await rebuildInvalidIndex();
        const latestFile = await fileStat(indexPath);

        if (latestFile) {
            fileBackedIndexCache.set(indexPath, {
                lastModified: latestFile.mtimeMs,
                index: cloneIndex(index),
            });
        } else {
            fileBackedIndexCache.delete(indexPath);
        }

        return index;
    }
}

async function fileStat(pathname: string) {
    try {
        return await stat(pathname);
    } catch {
        return undefined;
    }
}

function cloneIndex<TIndex>(index: TIndex): TIndex {
    return structuredClone(index);
}

export async function readExistingIdsInOrder(
    ids: string[],
    filePathForId: (id: string) => string,
) {
    const results = await Promise.all(
        ids.map(async (id) => ({
            id,
            exists: await Bun.file(filePathForId(id)).exists(),
        })),
    );

    return results.filter((result) => result.exists).map((result) => result.id);
}

export async function readEntitiesFromIds<TEntity>(
    ids: string[],
    readById: (id: string) => Promise<TEntity | undefined>,
): Promise<TEntity[]> {
    const entities = await Promise.all(ids.map((id) => readById(id)));
    return entities.filter(isDefined);
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
