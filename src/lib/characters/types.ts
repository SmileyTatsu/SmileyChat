export type TavernCardV1 = {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
};

export type TavernCardV2 = {
    spec: "chara_card_v2";
    spec_version: "2.0";
    data: TavernCardDataV2;
};

export type TavernCardDataV2 = {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    character_book?: CharacterBook;
    tags: string[];
    creator: string;
    character_version: string;
    extensions: Record<string, unknown>;
};

export type CharacterBook = {
    name?: string;
    description?: string;
    scan_depth?: number;
    token_budget?: number;
    recursive_scanning?: boolean;
    extensions: Record<string, unknown>;
    entries: CharacterBookEntry[];
};

export type CharacterBookEntry = {
    keys: string[];
    content: string;
    extensions: Record<string, unknown>;
    enabled: boolean;
    insertion_order: number;
    case_sensitive?: boolean;
    name?: string;
    priority?: number;
    id?: number;
    comment?: string;
    selective?: boolean;
    secondary_keys?: string[];
    constant?: boolean;
    position?: "before_char" | "after_char";
};

export type CharacterCardV3 = {
    spec: "chara_card_v3";
    spec_version: "3.0";
    data: TavernCardDataV3;
};

export type TavernCardDataV3 = TavernCardDataV2 & {
    assets?: Array<{
        type: string;
        uri: string;
        name: string;
        ext: string;
    }>;
    nickname?: string;
    creator_notes_multilingual?: Record<string, string>;
    source?: string[];
    group_only_greetings: string[];
    creation_date?: number;
    modification_date?: number;
};

export type CharacterImportFormat = "json" | "png" | "seed" | "manual";

export type SmileyCharacter = {
    id: string;
    version: 1;
    data: TavernCardDataV2;
    avatar?: {
        type: "png" | "jpeg" | "webp";
        path: string;
    };
    importedFrom?: {
        format: CharacterImportFormat;
        sourceFileName?: string;
        fingerprint?: string;
        importedAt?: string;
    };
    createdAt: string;
    updatedAt: string;
};

export type CharacterSummary = {
    id: string;
    name: string;
    tagline: string;
    avatar?: SmileyCharacter["avatar"];
    importedFrom?: SmileyCharacter["importedFrom"];
    updatedAt: string;
};

export type CharacterIndexEntry = {
    id: string;
    name: string;
    tagline: string;
    basePath: string;
    avatar?: SmileyCharacter["avatar"];
    importedFrom?: SmileyCharacter["importedFrom"];
    updatedAt: string;
};

export type CharacterIndex = {
    version: 1;
    activeCharacterId: string;
    characters: CharacterIndexEntry[];
};

export type CharacterSummaryCollection = {
    version: 1;
    activeCharacterId: string;
    characters: CharacterSummary[];
};

export type CharacterCollection = {
    version: 1;
    activeCharacterId: string;
    characters: SmileyCharacter[];
};

export type DroppedCharacterImportResult = {
    imported: number;
    skipped: number;
    activeCharacterId?: string;
    characters?: CharacterSummaryCollection;
    failed: Array<{
        fileName: string;
        error: string;
    }>;
};
