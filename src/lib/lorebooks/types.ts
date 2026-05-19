export type LorebookCollection = {
    version: 1;
    activeLorebookId: string;
    lorebooks: LorebookSummary[];
};

export type LorebookIndex = {
    version: 1;
    activeLorebookId: string;
    lorebookIds: string[];
};

export type LorebookSummary = {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    entryCount: number;
    enabledEntryCount: number;
    importedFrom?: LorebookImportMetadata;
    updatedAt: string;
};

export type Lorebook = {
    id: string;
    version: 1;
    title: string;
    description: string;
    settings: LorebookSettings;
    entries: LorebookEntry[];
    importedFrom?: LorebookImportMetadata;
    metadata?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type LorebookSettings = {
    scanDepth: number;
    tokenBudget: {
        mode: "percent" | "tokens";
        value: number;
    };
    includeNames: boolean;
    recursive: boolean;
    maxRecursionSteps: number;
    minActivations: number;
    minActivationsMaxDepth: number;
    caseSensitive: boolean;
    matchWholeWords: boolean;
    useGroupScoring: boolean;
    insertionStrategy: "sorted-evenly" | "character-first" | "global-first";
    overflowAlert: boolean;
};

export type LorebookEntry = {
    id: string;
    uid?: number;
    enabled: boolean;
    title: string;
    keys: string[];
    secondaryKeys: string[];
    selectiveLogic: "and-any" | "and-all" | "not-any" | "not-all";
    content: string;
    strategy: "constant" | "keyword" | "vectorized";
    insertionOrder: number;
    position: LorebookInsertionPosition;
    role: "system" | "user" | "assistant";
    depth: number;
    outletName: string;
    probability: number;
    useProbability: boolean;
    inclusionGroups: string[];
    groupWeight: number;
    prioritizeInclusion: boolean;
    useGroupScoring?: boolean;
    scanDepth?: number;
    caseSensitive?: boolean;
    matchWholeWords?: boolean;
    recursive: {
        exclude: boolean;
        preventFurther: boolean;
        delayUntilRecursion: number;
    };
    matchSources: {
        personaDescription: boolean;
        characterDescription: boolean;
        characterPersonality: boolean;
        characterNotes: boolean;
        scenario: boolean;
        creatorNotes: boolean;
    };
    timedEffects: {
        sticky: number;
        cooldown: number;
        delay: number;
    };
    characterFilter: {
        mode: "include" | "exclude";
        names: string[];
        tags: string[];
    };
    triggers: LorebookGenerationTrigger[];
    automationId: string;
    ignoreBudget: boolean;
    extensions: Record<string, unknown>;
};

export type LorebookInsertionPosition =
    | "before-char"
    | "after-char"
    | "before-examples"
    | "after-examples"
    | "author-note-top"
    | "author-note-bottom"
    | "at-depth"
    | "outlet";

export type LorebookGenerationTrigger =
    | "normal"
    | "continue"
    | "impersonate"
    | "swipe"
    | "regenerate"
    | "quiet";

export type LorebookImportMetadata = {
    format: "smiley" | "sillytavern";
    importedAt?: string;
    sourceFileName?: string;
};

export type LorebookImportResult = {
    imported: number;
    skipped: number;
    activeLorebookId?: string;
    lorebooks?: LorebookCollection;
    failed: Array<{
        fileName: string;
        error: string;
    }>;
};
