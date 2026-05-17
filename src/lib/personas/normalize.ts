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
    const avatar = normalizeImageAvatar(value.avatar);
    const timestamps = normalizeTimestamps(value, now);

    return {
        id,
        version: 1,
        name,
        description: asString(value.description),
        ...(avatar ? { avatar } : {}),
        ...timestamps,
    };
}

export function normalizePersonaSummary(value: unknown): PersonaSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const name = asString(value.name).trim();
    const avatar = normalizeImageAvatar(value.avatar);

    if (!id || !name) {
        return undefined;
    }

    return {
        id,
        name,
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

    return {
        version: 1,
        activePersonaId: selectActiveId(
            safePersonaIds.map((id) => ({ id })),
            value.activePersonaId,
            defaultPersona.id,
        ),
        personaIds: safePersonaIds,
    };
}
