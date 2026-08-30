import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import {
    asString,
    normalizeArray,
    normalizeImageAvatar,
    normalizeTimestamps,
    normalizeUpdatedAt,
    selectActiveId,
} from "../common/normalize";

import {
    defaultPersona,
    defaultPersonaSummaryCollection,
    personaToSummary,
} from "./defaults";
import type {
    PersonaIndex,
    PersonaSummary,
    PersonaSummaryCollection,
    SmileyPersona,
} from "./types";

export function normalizePersona(value: unknown): SmileyPersona | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const now = new Date().toISOString();
    const id = asString(value.id) || createId("persona");
    const name = asString(value.name).trim() || "Anon";
    const dialogueColor = normalizeDialogueColor(value.dialogueColor);
    const avatar = normalizeImageAvatar(value.avatar);
    const metadata = normalizeMetadata(value.metadata);
    const timestamps = normalizeTimestamps(value, now);

    return {
        id,
        version: 1,
        name,
        description: asString(value.description),
        ...(dialogueColor ? { dialogueColor } : {}),
        ...(avatar ? { avatar } : {}),
        ...(metadata ? { metadata } : {}),
        ...timestamps,
    };
}

export function getPersonaDialogueColor(persona: SmileyPersona) {
    return normalizeDialogueColor(persona.dialogueColor);
}

export function normalizePersonaSummary(value: unknown): PersonaSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const name = asString(value.name).trim();
    const dialogueColor = normalizeDialogueColor(value.dialogueColor);
    const avatar = normalizeImageAvatar(value.avatar);

    if (!id || !name) {
        return undefined;
    }

    return {
        id,
        name,
        ...(dialogueColor ? { dialogueColor } : {}),
        ...(avatar ? { avatar } : {}),
        updatedAt: normalizeUpdatedAt(value.updatedAt),
    };
}

export function normalizePersonaSummaryCollection(
    value: unknown,
): PersonaSummaryCollection {
    if (!isRecord(value)) {
        return defaultPersonaSummaryCollection;
    }

    const personas = normalizeArray(value.personas, normalizePersonaSummary);
    const safePersonas = personas.length ? personas : [personaToSummary(defaultPersona)];

    return {
        version: 1,
        activePersonaId: selectActiveId(safePersonas, value.activePersonaId),
        personas: safePersonas,
    };
}

export function normalizePersonaIndex(value: unknown): PersonaIndex {
    if (!isRecord(value)) {
        return {
            version: 1,
            activePersonaId: defaultPersona.id,
            personaIds: [defaultPersona.id],
            summaries: [personaToSummary(defaultPersona)],
        };
    }

    const personaIds = Array.isArray(value.personaIds)
        ? Array.from(
              new Set(
                  value.personaIds.filter(
                      (item): item is string => typeof item === "string",
                  ),
              ),
          )
        : [];
    const safePersonaIds = personaIds.length ? personaIds : [defaultPersona.id];
    const summariesById = new Map(
        normalizeArray(value.summaries, normalizePersonaSummary).map((summary) => [
            summary.id,
            summary,
        ]),
    );

    return {
        version: 1,
        activePersonaId: selectActiveId(
            safePersonaIds.map((id) => ({ id })),
            value.activePersonaId,
            defaultPersona.id,
        ),
        personaIds: safePersonaIds,
        summaries: safePersonaIds.flatMap((id) => {
            const summary = summariesById.get(id);
            return summary ? [summary] : [];
        }),
    };
}

function normalizeMetadata(value: unknown): SmileyPersona["metadata"] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return { ...value };
}

function normalizeDialogueColor(value: unknown) {
    const color = asString(value).trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}
