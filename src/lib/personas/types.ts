export type SmileyPersona = {
    id: string;
    version: 1;
    name: string;
    description: string;
    avatar?: {
        type: "png" | "jpeg" | "webp";
        path: string;
    };
    createdAt: string;
    updatedAt: string;
};

export type PersonaSummary = {
    id: string;
    name: string;
    avatar?: SmileyPersona["avatar"];
    updatedAt: string;
};

export type PersonaIndex = {
    version: 1;
    activePersonaId: string;
    personaIds: string[];
};

export type PersonaSummaryCollection = {
    version: 1;
    activePersonaId: string;
    personas: PersonaSummary[];
};
