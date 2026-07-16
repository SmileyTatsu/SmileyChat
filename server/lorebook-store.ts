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
    LorebookEntry,
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
import { withResourceLock } from "./resource-lock";

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
    return withResourceLock(`lorebook:${lorebookId}`, () =>
        writeLorebookByIdUnlocked(lorebookId, value),
    );
}

async function writeLorebookByIdUnlocked(lorebookId: string, value: unknown) {
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

export async function patchLorebookById(lorebookId: string, value: unknown) {
    return withResourceLock(`lorebook:${lorebookId}`, async () => {
        const existing = await readLorebookById(lorebookId);
        if (!existing) throw new NotFoundError("LoreBook not found.");
        const patch = isRecord(value) ? value : {};
        const lorebook = normalizeLorebook({
            ...existing,
            ...(typeof patch.title === "string" ? { title: patch.title } : {}),
            ...(typeof patch.description === "string"
                ? { description: patch.description }
                : {}),
            ...(isRecord(patch.settings)
                ? { settings: { ...existing.settings, ...patch.settings } }
                : {}),
            ...(isRecord(patch.metadata)
                ? { metadata: { ...existing.metadata, ...patch.metadata } }
                : {}),
            ...(isRecord(patch.extensions)
                ? { extensions: { ...existing.extensions, ...patch.extensions } }
                : {}),
            entries: existing.entries,
            updatedAt: new Date().toISOString(),
        });
        if (!lorebook) throw new BadRequestError("Invalid LoreBook patch.");
        await writeJsonAtomic(lorebookFilePath(lorebookId), lorebook);
        return lorebook;
    });
}

export async function addLorebookEntry(lorebookId: string, value: unknown) {
    return withResourceLock(`lorebook:${lorebookId}`, async () => {
        const lorebook = await readLorebookById(lorebookId);
        if (!lorebook) throw new NotFoundError("LoreBook not found.");
        const entry = normalizeEntry(value);
        if (!entry) throw new BadRequestError("Invalid LoreBook entry.");
        if (lorebook.entries.some((item) => item.id === entry.id)) {
            throw new BadRequestError("LoreBook entry ID already exists.");
        }
        return writeLorebookEntries(lorebook, [...lorebook.entries, entry]);
    });
}

export async function patchLorebookEntry(
    lorebookId: string,
    entryId: string,
    value: unknown,
) {
    return withResourceLock(`lorebook:${lorebookId}`, async () => {
        const lorebook = await readLorebookById(lorebookId);
        if (!lorebook) throw new NotFoundError("LoreBook not found.");
        const existing = lorebook.entries.find((entry) => entry.id === entryId);
        if (!existing) throw new NotFoundError("LoreBook entry not found.");
        const entry = normalizeEntry({
            ...existing,
            ...(isRecord(value) ? value : {}),
            id: entryId,
        });
        if (!entry) throw new BadRequestError("Invalid LoreBook entry patch.");
        return writeLorebookEntries(
            lorebook,
            lorebook.entries.map((item) => (item.id === entryId ? entry : item)),
        );
    });
}

export async function removeLorebookEntry(lorebookId: string, entryId: string) {
    return withResourceLock(`lorebook:${lorebookId}`, async () => {
        const lorebook = await readLorebookById(lorebookId);
        if (!lorebook) throw new NotFoundError("LoreBook not found.");
        if (!lorebook.entries.some((entry) => entry.id === entryId))
            throw new NotFoundError("LoreBook entry not found.");
        return writeLorebookEntries(
            lorebook,
            lorebook.entries.filter((entry) => entry.id !== entryId),
        );
    });
}

function normalizeEntry(value: unknown): LorebookEntry | undefined {
    return normalizeLorebook({ title: "entry", entries: [value] })?.entries[0];
}

async function writeLorebookEntries(lorebook: Lorebook, entries: LorebookEntry[]) {
    const next = { ...lorebook, entries, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(lorebookFilePath(lorebook.id), next);
    return next;
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
