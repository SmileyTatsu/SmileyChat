import { rm } from "node:fs/promises";

import { isRecord } from "#frontend/lib/common/guards";
import {
    lorebookToSummary,
    normalizeLorebook,
    normalizeLorebookCollection,
    normalizeLorebookIndex,
} from "#frontend/lib/lorebooks/normalize";
import {
    exportSillyTavernLorebook,
    importSillyTavernLorebook,
    isSillyTavernLorebook,
} from "#frontend/lib/lorebooks/sillytavern";
import type {
    Lorebook,
    LorebookCollection,
    LorebookImportResult,
    LorebookIndex,
} from "#frontend/lib/lorebooks/types";

import {
    discoverJsonFiles,
    readEntitiesFromIds,
    readExistingIdsInOrder,
    readFileBackedIndex,
    writeFileBackedIndex,
} from "./file-store";
import { BadRequestError, NotFoundError, json, writeJsonAtomic } from "./http";
import { lorebookFilePath } from "./lorebook-file-paths";
import { lorebookBooksDir, lorebookIndexPath, lorebookOrphanedDir } from "./paths";

export async function readLorebookCollection(): Promise<LorebookCollection> {
    const index = await readLorebookIndex();
    const lorebooks = await readLorebooksFromIndex(index);

    return normalizeLorebookCollection({
        version: 1,
        activeLorebookId: index.activeLorebookId,
        lorebooks: lorebooks.map(lorebookToSummary),
    });
}

export async function readLorebookById(lorebookId: string) {
    const path = lorebookFilePath(lorebookId);

    if (!(await Bun.file(path).exists())) {
        return undefined;
    }

    return normalizeLorebook({
        ...(await Bun.file(path).json()),
        id: lorebookId,
    });
}

export async function createLorebook(value: unknown) {
    const lorebook = normalizeLorebook(value);

    if (!lorebook) {
        throw new BadRequestError("Invalid lorebook.");
    }

    await writeJsonAtomic(lorebookFilePath(lorebook.id), lorebook);
    const index = await readLorebookIndex();
    const lorebookIds = index.lorebookIds.includes(lorebook.id)
        ? moveToFront(index.lorebookIds, lorebook.id)
        : [lorebook.id, ...index.lorebookIds];
    const activeLorebookId = index.activeLorebookId || lorebook.id;

    await writeFileBackedIndex(lorebookIndexPath, {
        version: 1,
        activeLorebookId,
        lorebookIds,
    });

    return {
        lorebook,
        summary: lorebookToSummary(lorebook),
        lorebooks: await readLorebookCollection(),
    };
}

export async function writeLorebookById(lorebookId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const lorebook = normalizeLorebook({
        ...source,
        id: lorebookId,
    });

    if (!lorebook) {
        throw new BadRequestError("Invalid lorebook.");
    }

    await writeJsonAtomic(lorebookFilePath(lorebook.id), lorebook);
    const index = await readLorebookIndex();

    if (!index.lorebookIds.includes(lorebook.id)) {
        await writeFileBackedIndex(lorebookIndexPath, {
            version: 1,
            activeLorebookId: index.activeLorebookId || lorebook.id,
            lorebookIds: [lorebook.id, ...index.lorebookIds],
        });
    }

    return lorebook;
}

export async function deleteLorebookById(lorebookId: string) {
    const lorebook = await readLorebookById(lorebookId);

    if (!lorebook || !(await Bun.file(lorebookFilePath(lorebookId)).exists())) {
        return undefined;
    }

    await rm(lorebookFilePath(lorebookId), { force: true });
    const index = await readLorebookIndex();
    const lorebookIds = index.lorebookIds.filter((item) => item !== lorebookId);

    await writeFileBackedIndex(lorebookIndexPath, {
        version: 1,
        activeLorebookId:
            index.activeLorebookId === lorebookId
                ? (lorebookIds[0] ?? "")
                : index.activeLorebookId,
        lorebookIds,
    });

    return {
        lorebooks: await readLorebookCollection(),
    };
}

export async function updateLorebookIndex(value: unknown) {
    const current = await readLorebookIndex();
    const source = isRecord(value) ? value : {};
    const requestedIds = Array.isArray(source.lorebookIds)
        ? source.lorebookIds.filter((item): item is string => typeof item === "string")
        : current.lorebookIds;
    const lorebookIds = await readExistingIdsInOrder(requestedIds, lorebookFilePath);
    const activeLorebookId = lorebookIds.includes(String(source.activeLorebookId))
        ? String(source.activeLorebookId)
        : (lorebookIds[0] ?? "");
    const index = {
        version: 1 as const,
        activeLorebookId,
        lorebookIds,
    };

    await writeFileBackedIndex(lorebookIndexPath, index);
    return index;
}

export async function importUploadedLorebooks(
    request: Request,
): Promise<LorebookImportResult> {
    const form = await request.formData();
    const files = form
        .getAll("files")
        .filter((file): file is File => file instanceof File);
    const result: LorebookImportResult = {
        imported: 0,
        skipped: 0,
        failed: [],
    };

    for (const file of files) {
        try {
            const value = JSON.parse(await file.text()) as unknown;
            const lorebook = importLorebookJson(value, file.name);

            await createLorebook(lorebook);
            result.imported += 1;
            result.activeLorebookId = result.activeLorebookId ?? lorebook.id;
        } catch (error) {
            result.failed.push({
                fileName: file.name,
                error: error instanceof Error ? error.message : "Import failed.",
            });
        }
    }

    result.lorebooks = await readLorebookCollection();
    return result;
}

export async function exportLorebook(lorebookId: string, format: "smiley" | "st") {
    const lorebook = await readLorebookById(lorebookId);

    if (!lorebook) {
        throw new NotFoundError("LoreBook not found.");
    }

    const body =
        format === "st"
            ? exportSillyTavernLorebook(lorebook)
            : {
                  ...lorebook,
                  importedFrom: {
                      format: "smiley" as const,
                      sourceFileName: `${lorebook.title}.smiley-lorebook.json`,
                  },
              };
    const fileName = safeFileName(
        `${lorebook.title || "lorebook"}${
            format === "st" ? ".worldinfo.json" : ".smiley-lorebook.json"
        }`,
    );

    return new Response(`${JSON.stringify(body, null, 2)}\n`, {
        headers: {
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Type": "application/json; charset=utf-8",
        },
    });
}

function importLorebookJson(value: unknown, sourceFileName: string) {
    if (isSillyTavernLorebook(value)) {
        return importSillyTavernLorebook(value, { sourceFileName });
    }

    const lorebook = normalizeLorebook({
        ...(isRecord(value) ? value : {}),
        importedFrom: {
            format: "smiley",
            importedAt: new Date().toISOString(),
            sourceFileName,
        },
    });

    if (!lorebook) {
        throw new BadRequestError("LoreBook JSON is not a supported shape.");
    }

    return lorebook;
}

async function readLorebookIndex(): Promise<LorebookIndex> {
    return readFileBackedIndex({
        indexPath: lorebookIndexPath,
        normalizeIndex: normalizeLorebookIndex,
        repairIndex: repairLorebookIndex,
        rebuildIndex: rebuildLorebookIndex,
    });
}

async function repairLorebookIndex(index: LorebookIndex): Promise<LorebookIndex> {
    const lorebookIds = await readExistingIdsInOrder(index.lorebookIds, lorebookFilePath);

    if (lorebookIds.length === index.lorebookIds.length) {
        return index;
    }

    const repairedIndex = {
        version: 1 as const,
        activeLorebookId: lorebookIds.includes(index.activeLorebookId)
            ? index.activeLorebookId
            : (lorebookIds[0] ?? ""),
        lorebookIds,
    };

    await writeFileBackedIndex(lorebookIndexPath, repairedIndex);
    return repairedIndex;
}

async function rebuildLorebookIndex(): Promise<LorebookIndex> {
    const lorebooks = await discoverJsonFiles<Lorebook>({
        directory: lorebookBooksDir,
        orphanedDirectory: lorebookOrphanedDir,
        normalizeFile: (value, fileName) =>
            normalizeLorebook({
                ...(isRecord(value) ? value : {}),
                id: fileName.slice(0, -".json".length),
            }),
    });
    const sortedLorebooks = sortLorebooks(lorebooks);
    const index = {
        version: 1 as const,
        activeLorebookId: sortedLorebooks[0]?.id ?? "",
        lorebookIds: sortedLorebooks.map((lorebook) => lorebook.id),
    };

    await writeFileBackedIndex(lorebookIndexPath, index);
    return index;
}

async function readLorebooksFromIndex(index: LorebookIndex) {
    const lorebooks = await readEntitiesFromIds(index.lorebookIds, readLorebookById);
    return sortLorebooks(lorebooks);
}

function sortLorebooks(lorebooks: Lorebook[]) {
    return [...lorebooks].sort(
        (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
            left.title.localeCompare(right.title),
    );
}

function moveToFront(ids: string[], id: string) {
    return [id, ...ids.filter((item) => item !== id)];
}

function safeFileName(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120) || "lorebook.json"
    );
}

export function lorebookNotFoundResponse() {
    return json({ error: "LoreBook not found." }, 404);
}
