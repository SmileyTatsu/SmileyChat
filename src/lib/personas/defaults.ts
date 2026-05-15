import { createId } from "../common/ids";

import type { PersonaSummaryCollection, SmileyPersona } from "./types";

const now = new Date().toISOString();

export const defaultPersona: SmileyPersona = {
    id: createId("persona"),
    version: 1,
    name: "Anon",
    description: "",
    createdAt: now,
    updatedAt: now,
};

export const defaultPersonaSummaryCollection: PersonaSummaryCollection = {
    version: 1,
    activePersonaId: defaultPersona.id,
    personas: [personaToSummary(defaultPersona)],
};

export function createBlankPersona(name = "New persona"): SmileyPersona {
    const createdAt = new Date().toISOString();

    return {
        id: createId("persona"),
        version: 1,
        name,
        description: "",
        createdAt,
        updatedAt: createdAt,
    };
}

export function personaToSummary(persona: SmileyPersona) {
    return {
        id: persona.id,
        name: persona.name,
        ...(persona.avatar ? { avatar: persona.avatar } : {}),
        updatedAt: persona.updatedAt,
    };
}
