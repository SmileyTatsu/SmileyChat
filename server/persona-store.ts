import { Glob } from "bun";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestError, writeJsonAtomic } from "./http";
import { moveToUniquePath } from "./character-file-utils";
import { deletePersonaAvatarAsset } from "./persona-images";
import { personaFilePath } from "./persona-file-paths";
import { personaCardsDir, personaIndexPath, personaOrphanedDir } from "./paths";
import { defaultPersona, personaToSummary } from "../src/lib/personas/defaults";
import {
    normalizePersona,
    normalizePersonaIndex,
    normalizePersonaSummaryCollection,
} from "../src/lib/personas/normalize";
import type {
    PersonaIndex,
    PersonaSummaryCollection,
    SmileyPersona,
} from "../src/lib/personas/types";
import { isRecord } from "../src/lib/common/guards";

export async function readPersonaSummaryCollection(): Promise<PersonaSummaryCollection> {
    const index = await readPersonaIndex();
    const personas = await readPersonasFromIndex(index);

    return normalizePersonaSummaryCollection({
        version: 1,
        activePersonaId: index.activePersonaId,
        personas: personas.map(personaToSummary),
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

    await writeJsonAtomic(personaIndexPath, {
        version: 1,
        activePersonaId: index.activePersonaId,
        personaIds,
    });

    return {
        persona,
        summary: personaToSummary(persona),
        personas: await readPersonaSummaryCollection(),
    };
}

export async function writePersonaById(personaId: string, value: unknown) {
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

    if (!index.personaIds.includes(persona.id)) {
        await writeJsonAtomic(personaIndexPath, {
            version: 1,
            activePersonaId: index.activePersonaId,
            personaIds: [...index.personaIds, persona.id],
        });
    }

    return persona;
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
    };

    await writeJsonAtomic(personaIndexPath, index);
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
    };

    await writeJsonAtomic(personaIndexPath, nextIndex);

    return {
        personas: await readPersonaSummaryCollection(),
    };
}

async function readPersonaIndex(): Promise<PersonaIndex> {
    if (await Bun.file(personaIndexPath).exists()) {
        try {
            const file = Bun.file(personaIndexPath);
            return repairPersonaIndex(normalizePersonaIndex(await file.json()));
        } catch {
            return rebuildPersonaIndexFromCards();
        }
    }

    const rebuiltIndex = await rebuildPersonaIndexFromCards();
    if (rebuiltIndex.personaIds.length > 0) {
        return rebuiltIndex;
    }

    await writeDefaultPersonaCollection();
    return collectionToIndex([defaultPersona], defaultPersona.id);
}

async function repairPersonaIndex(index: PersonaIndex): Promise<PersonaIndex> {
    const personaIds: string[] = [];

    for (const personaId of index.personaIds) {
        if (await Bun.file(personaFilePath(personaId)).exists()) {
            personaIds.push(personaId);
        }
    }

    if (personaIds.length === index.personaIds.length && personaIds.length > 0) {
        return index;
    }

    if (personaIds.length === 0) {
        await writeDefaultPersonaCollection();
        return collectionToIndex([defaultPersona], defaultPersona.id);
    }

    const repairedIndex = {
        version: 1 as const,
        activePersonaId: personaIds.includes(index.activePersonaId)
            ? index.activePersonaId
            : personaIds[0],
        personaIds,
    };
    await writeJsonAtomic(personaIndexPath, repairedIndex);
    return repairedIndex;
}

async function rebuildPersonaIndexFromCards(): Promise<PersonaIndex> {
    const personas: SmileyPersona[] = [];
    const glob = new Glob("*.json");

    for await (const fileName of glob.scan(personaCardsDir)) {
        const filePath = join(personaCardsDir, fileName);

        try {
            const persona = normalizePersona({
                ...(await Bun.file(filePath).json()),
                id: fileName.slice(0, -".json".length),
            });

            if (persona) {
                personas.push(persona);
            }
        } catch {
            await moveToUniquePath(filePath, personaOrphanedDir, fileName);
        }
    }

    if (personas.length === 0) {
        return {
            version: 1,
            activePersonaId: "",
            personaIds: [],
        };
    }

    const sortedPersonas = personas.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
    );
    const index = collectionToIndex(sortedPersonas, sortedPersonas[0].id);

    await writeJsonAtomic(personaIndexPath, index);
    return index;
}

async function readPersonasFromIndex(index: PersonaIndex) {
    const personas: SmileyPersona[] = [];

    for (const personaId of index.personaIds) {
        const persona = await readPersonaById(personaId);

        if (persona) {
            personas.push(persona);
        }
    }

    if (personas.length === 0) {
        await writeDefaultPersonaCollection();
        return [defaultPersona];
    }

    return personas;
}

async function writeDefaultPersonaCollection() {
    await writeJsonAtomic(personaFilePath(defaultPersona.id), defaultPersona);
    await writeJsonAtomic(
        personaIndexPath,
        collectionToIndex([defaultPersona], defaultPersona.id),
    );
}

function collectionToIndex(personas: SmileyPersona[], activePersonaId: string) {
    return {
        version: 1 as const,
        activePersonaId,
        personaIds: personas.map((persona) => persona.id),
    };
}
