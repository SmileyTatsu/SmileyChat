import { isRecord } from "../common/guards";
import { createId } from "../common/ids";

import {
    defaultPersona,
    defaultPersonaSummaryCollection,
    personaToSummary,
} from "./defaults";
import type {
    PersonaIndex,
    PersonaSummary,
    PersonaSummaryCollection,
    ScyllaPersona,
} from "./types";

export function normalizePersona(value: unknown): ScyllaPersona | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const now = new Date().toISOString();
    const id = asString(value.id) || createId("persona");
    const name = asString(value.name).trim() || "Anon";
    const avatar = normalizeAvatar(value.avatar);

    return {
        id,
        version: 1,
        name,
        description: asString(value.description),
        ...(avatar ? { avatar } : {}),
        createdAt: asIsoString(value.createdAt) || now,
        updatedAt: asIsoString(value.updatedAt) || now,
    };
}

export function normalizePersonaSummary(value: unknown): PersonaSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const name = asString(value.name).trim();
    const avatar = normalizeAvatar(value.avatar);

    if (!id || !name) {
        return undefined;
    }

    return {
        id,
        name,
        ...(avatar ? { avatar } : {}),
        updatedAt: asIsoString(value.updatedAt) || new Date().toISOString(),
    };
}

export function normalizePersonaSummaryCollection(
    value: unknown,
): PersonaSummaryCollection {
    if (!isRecord(value)) {
        return defaultPersonaSummaryCollection;
    }

    const personas = Array.isArray(value.personas)
        ? value.personas
              .map(normalizePersonaSummary)
              .filter((persona): persona is PersonaSummary => Boolean(persona))
        : [];
    const safePersonas = personas.length ? personas : [personaToSummary(defaultPersona)];
    const requestedActiveId = asString(value.activePersonaId);
    const activePersonaId = safePersonas.some(
        (persona) => persona.id === requestedActiveId,
    )
        ? requestedActiveId
        : safePersonas[0].id;

    return {
        version: 1,
        activePersonaId,
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
    const requestedActiveId = asString(value.activePersonaId);

    return {
        version: 1,
        activePersonaId: safePersonaIds.includes(requestedActiveId)
            ? requestedActiveId
            : safePersonaIds[0],
        personaIds: safePersonaIds,
    };
}

function normalizeAvatar(value: unknown): ScyllaPersona["avatar"] | undefined {
    if (
        !isRecord(value) ||
        (value.type !== "png" && value.type !== "jpeg" && value.type !== "webp")
    ) {
        return undefined;
    }

    const path = asString(value.path);
    return path ? { type: value.type, path } : undefined;
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function asIsoString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}
