import { rm } from "node:fs/promises";

import { isRecord } from "#frontend/lib/common/guards";
import { defaultPersona, personaToSummary } from "#frontend/lib/personas/defaults";
import {
    normalizePersona,
    normalizePersonaIndex,
    normalizePersonaSummaryCollection,
} from "#frontend/lib/personas/normalize";
import type {
    PersonaIndex,
    PersonaSummary,
    PersonaSummaryCollection,
    SmileyPersona,
} from "#frontend/lib/personas/types";

import {
    discoverJsonFiles,
    readEntitiesFromIds,
    readExistingIdsInOrder,
    readFileBackedIndex,
    writeFileBackedIndex,
} from "./file-store";
import { BadRequestError, NotFoundError, writeJsonAtomic } from "./http";
import { personaCardsDir, personaIndexPath, personaOrphanedDir } from "./paths";
import { personaFilePath } from "./persona-file-paths";
import { deletePersonaAvatarAsset } from "./persona-images";
import { withResourceLock } from "./resource-lock";

export async function readPersonaSummaryCollection(): Promise<PersonaSummaryCollection> {
    const index = await readPersonaIndex();

    return normalizePersonaSummaryCollection({
        version: 1,
        activePersonaId: index.activePersonaId,
        personas: index.summaries,
    });
}

export async function readPersonaById(personaId: string) {
    const path = personaFilePath(personaId);

    if (!(await Bun.file(path).exists())) {
        return undefined;
    }

    return normalizePersona({
        ...(await Bun.file(path).json()),
        id: personaId,
    });
}

export async function createPersona(value: unknown) {
    const persona = normalizePersona(value);

    if (!persona) {
        throw new BadRequestError("Invalid persona.");
    }

    await writeJsonAtomic(personaFilePath(persona.id), persona);

    const index = await readPersonaIndex();
    const personaIds = index.personaIds.includes(persona.id)
        ? index.personaIds
        : [...index.personaIds, persona.id];

    await writeFileBackedIndex(personaIndexPath, {
        version: 1,
        activePersonaId: index.activePersonaId,
        personaIds,
        summaries: replacePersonaSummary(index.summaries, personaToSummary(persona)),
    });

    return {
        persona,
        summary: personaToSummary(persona),
        personas: await readPersonaSummaryCollection(),
    };
}

export async function writePersonaById(personaId: string, value: unknown) {
    return withResourceLock(`persona:${personaId}`, () =>
        writePersonaByIdUnlocked(personaId, value),
    );
}

async function writePersonaByIdUnlocked(personaId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const persona = normalizePersona({
        ...source,
        id: personaId,
    });

    if (!persona) {
        throw new BadRequestError("Invalid persona.");
    }

    const existingPersona = await readPersonaById(personaId);
    await writeJsonAtomic(personaFilePath(persona.id), persona);
    if (existingPersona && existingPersona.avatar?.path !== persona.avatar?.path) {
        await deletePersonaAvatarAsset(existingPersona);
    }

    const index = await readPersonaIndex();

    await writeFileBackedIndex(personaIndexPath, {
        version: 1,
        activePersonaId: index.activePersonaId,
        personaIds: index.personaIds.includes(persona.id)
            ? index.personaIds
            : [...index.personaIds, persona.id],
        summaries: replacePersonaSummary(index.summaries, personaToSummary(persona)),
    });

    return persona;
}

export async function patchPersonaById(personaId: string, value: unknown) {
    return withResourceLock(`persona:${personaId}`, async () => {
        const patch = isRecord(value) ? value : undefined;
        if (!patch) {
            throw new BadRequestError("Persona patch must be an object.");
        }

        const existingPersona = await readPersonaById(personaId);
        if (!existingPersona) {
            throw new NotFoundError("Persona not found.");
        }

        const persona = normalizePersona({
            ...existingPersona,
            ...patch,
            id: personaId,
            createdAt: existingPersona.createdAt,
            updatedAt: new Date().toISOString(),
        });
        if (!persona) {
            throw new BadRequestError("Invalid persona patch.");
        }

        await writeJsonAtomic(personaFilePath(personaId), persona);
        if (existingPersona.avatar?.path !== persona.avatar?.path) {
            await deletePersonaAvatarAsset(existingPersona);
        }

        const index = await readPersonaIndex();
        await writeFileBackedIndex(personaIndexPath, {
            version: 1,
            activePersonaId: index.activePersonaId,
            personaIds: index.personaIds,
            summaries: replacePersonaSummary(index.summaries, personaToSummary(persona)),
        });

        return persona;
    });
}

export async function updatePersonaIndex(value: unknown) {
    const current = await readPersonaIndex();
    const record = isRecord(value) ? value : {};
    const requestedIds = Array.isArray(record.personaIds)
        ? record.personaIds.filter((item): item is string => typeof item === "string")
        : current.personaIds;
    const personaIds: string[] = [];

    for (const personaId of requestedIds) {
        if (
            personaIds.includes(personaId) ||
            !(await Bun.file(personaFilePath(personaId)).exists())
        ) {
            continue;
        }

        personaIds.push(personaId);
    }

    if (personaIds.length === 0) {
        await writeDefaultPersonaCollection();
        return collectionToIndex([defaultPersona], defaultPersona.id);
    }

    const requestedActiveId =
        typeof record.activePersonaId === "string"
            ? record.activePersonaId
            : current.activePersonaId;
    const activePersonaId = personaIds.includes(requestedActiveId)
        ? requestedActiveId
        : personaIds[0];
    const index = {
        version: 1 as const,
        activePersonaId,
        personaIds,
        summaries: personaIds.flatMap((id) => {
            const summary = current.summaries.find((item) => item.id === id);
            return summary ? [summary] : [];
        }),
    };

    await writeFileBackedIndex(personaIndexPath, index);
    return index;
}

export async function deletePersonaById(personaId: string) {
    const persona = await readPersonaById(personaId);

    if (!persona || !(await Bun.file(personaFilePath(personaId)).exists())) {
        return undefined;
    }

    const index = await readPersonaIndex();

    if (index.personaIds.length <= 1) {
        throw new BadRequestError("Cannot delete the last persona.");
    }

    await deletePersonaAvatarAsset(persona);
    await rm(personaFilePath(personaId), { force: true });
    const personaIds = index.personaIds.filter((item) => item !== personaId);
    const nextIndex = {
        version: 1 as const,
        activePersonaId:
            index.activePersonaId === personaId ? personaIds[0] : index.activePersonaId,
        personaIds,
        summaries: index.summaries.filter((item) => item.id !== personaId),
    };

    await writeFileBackedIndex(personaIndexPath, nextIndex);

    return {
        personas: await readPersonaSummaryCollection(),
    };
}

async function readPersonaIndex(): Promise<PersonaIndex> {
    const rebuiltIndex = await readFileBackedIndex({
        indexPath: personaIndexPath,
        normalizeIndex: normalizePersonaIndex,
        repairIndex: repairPersonaIndex,
        rebuildIndex: rebuildPersonaIndexFromCards,
    });

    if (rebuiltIndex.personaIds.length > 0) {
        return rebuiltIndex;
    }

    await writeDefaultPersonaCollection();
    return collectionToIndex([defaultPersona], defaultPersona.id);
}

async function repairPersonaIndex(index: PersonaIndex): Promise<PersonaIndex> {
    const personaIds = await readExistingIdsInOrder(index.personaIds, personaFilePath);
    const summariesById = new Map(
        index.summaries.map((summary) => [summary.id, summary]),
    );
    const hasAllSummaries = personaIds.every((id) => summariesById.has(id));

    if (
        personaIds.length === index.personaIds.length &&
        hasAllSummaries &&
        personaIds.length > 0
    ) {
        return index;
    }

    if (personaIds.length === 0) {
        await writeDefaultPersonaCollection();
        return collectionToIndex([defaultPersona], defaultPersona.id);
    }

    const summaries = hasAllSummaries
        ? personaIds.flatMap((id) => {
              const summary = summariesById.get(id);
              return summary ? [summary] : [];
          })
        : (await readPersonasFromIndex({ ...index, personaIds })).map(personaToSummary);
    const repairedIndex = {
        version: 1 as const,
        activePersonaId: personaIds.includes(index.activePersonaId)
            ? index.activePersonaId
            : personaIds[0],
        personaIds,
        summaries,
    };
    await writeFileBackedIndex(personaIndexPath, repairedIndex);
    return repairedIndex;
}

async function rebuildPersonaIndexFromCards(): Promise<PersonaIndex> {
    const personas = await discoverJsonFiles<SmileyPersona>({
        directory: personaCardsDir,
        orphanedDirectory: personaOrphanedDir,
        normalizeFile: (value, fileName) =>
            normalizePersona({
                ...(isRecord(value) ? value : {}),
                id: fileName.slice(0, -".json".length),
            }),
    });

    if (personas.length === 0) {
        return {
            version: 1,
            activePersonaId: "",
            personaIds: [],
            summaries: [],
        };
    }

    const sortedPersonas = personas.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
    );
    const index = collectionToIndex(sortedPersonas, sortedPersonas[0].id);

    await writeFileBackedIndex(personaIndexPath, index);
    return index;
}

async function readPersonasFromIndex(index: PersonaIndex) {
    const personas = await readEntitiesFromIds(index.personaIds, readPersonaById);

    if (personas.length === 0) {
        await writeDefaultPersonaCollection();
        return [defaultPersona];
    }

    return personas;
}

async function writeDefaultPersonaCollection() {
    await writeJsonAtomic(personaFilePath(defaultPersona.id), defaultPersona);
    await writeFileBackedIndex(
        personaIndexPath,
        collectionToIndex([defaultPersona], defaultPersona.id),
    );
}

function collectionToIndex(personas: SmileyPersona[], activePersonaId: string) {
    return {
        version: 1 as const,
        activePersonaId,
        personaIds: personas.map((persona) => persona.id),
        summaries: personas.map(personaToSummary),
    };
}

function replacePersonaSummary(summaries: PersonaSummary[], summary: PersonaSummary) {
    const existingIndex = summaries.findIndex((item) => item.id === summary.id);
    if (existingIndex < 0) {
        return [...summaries, summary];
    }

    const next = [...summaries];
    next[existingIndex] = summary;
    return next;
}
