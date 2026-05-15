import type { CharacterCollection, ScyllaCharacter, TavernCardDataV2 } from "./types";

export const defaultCharacterData: TavernCardDataV2 = {
    name: "New character",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "",
    mes_example: "",
    creator_notes: "",
    system_prompt: "",
    post_history_instructions: "",
    alternate_greetings: [],
    tags: [],
    creator: "",
    character_version: "",
    extensions: {
        scyllachat: {
            tagline: "",
        },
    },
};

export const defaultCharacter: ScyllaCharacter = {
    id: "character-default",
    version: 1,
    data: defaultCharacterData,
    importedFrom: {
        format: "manual",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

export const defaultCharacterCollection: CharacterCollection = {
    version: 1,
    activeCharacterId: defaultCharacter.id,
    characters: [defaultCharacter],
};
