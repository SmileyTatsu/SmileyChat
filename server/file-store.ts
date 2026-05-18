import { Glob } from "bun";
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

export async function readFileBackedIndex<TIndex>({
    indexPath,
    normalizeIndex,
    repairIndex,
    rebuildIndex,
    rebuildInvalidIndex = rebuildIndex,
}: FileBackedIndexOptions<TIndex>): Promise<TIndex> {
    if (await Bun.file(indexPath).exists()) {
        try {
            return await repairIndex(normalizeIndex(await Bun.file(indexPath).json()));
        } catch {
            return rebuildInvalidIndex();
        }
    }

    return rebuildIndex();
}

export async function writeFileBackedIndex<TIndex>(
    indexPath: string,
    index: TIndex,
) {
    await writeJsonAtomic(indexPath, index);
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
