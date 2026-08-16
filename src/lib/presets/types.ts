export type PresetPromptRole = "system" | "user" | "assistant";

export type PresetInjectionPosition = "none" | "before" | "after";
export type PresetPromptAnchor =
    | "after-character"
    | "after-examples"
    | "after-history"
    | "after-scenario"
    | "before-character"
    | "before-examples"
    | "before-history"
    | "before-scenario";

export type PresetPrompt = {
    id: string;
    title: string;
    role: PresetPromptRole;
    content: string;
    systemPrompt: boolean;
    marker: boolean;
    injectionPosition: PresetInjectionPosition;
    injectionDepth: number;
    forbidOverrides: boolean;
    anchor?: PresetPromptAnchor;
};

export type PresetPromptOrderEntry = {
    promptId: string;
    enabled: boolean;
};

export type SmileyPreset = {
    id: string;
    title: string;
    prompts: PresetPrompt[];
    promptOrder: PresetPromptOrderEntry[];
    generation?: PresetGenerationSettings;
    formatting?: PresetFormattingSettings;
    metadata?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type PresetInstructTemplate =
    | "auto"
    | "none"
    | "chatml"
    | "llama3"
    | "mistral"
    | "gemma2"
    | "alpaca"
    | "deepseek-r1"
    | "custom";

export type InstructNamesBehavior = "never" | "force" | "always";

export type PresetFormattingSettings = {
    namesAsStopStrings?: boolean;
    separatorsAsStopStrings?: boolean;
    singleLineMode?: boolean;
    alwaysAddCharacterName?: boolean;
    exampleSeparator?: string;
    chatStartSeparator?: string;
    instructTemplate?: PresetInstructTemplate;
    sequencesAsStopStrings?: boolean;
    userPrefix?: string;
    userSuffix?: string;
    assistantPrefix?: string;
    assistantSuffix?: string;
    systemPrefix?: string;
    systemSuffix?: string;
    systemPrompt?: string;
    storyString?: string;
    storyStringPrefix?: string;
    storyStringSuffix?: string;
    firstInputSequence?: string;
    lastInputSequence?: string;
    firstOutputSequence?: string;
    lastOutputSequence?: string;
    systemSameAsUser?: boolean;
    userAlignmentMessage?: string;
    overridePresetPromptOrder?: boolean;
    stopSequences?: string[];
    wrapSequencesWithNewlines?: boolean;
    namesBehavior?: InstructNamesBehavior;
    replaceMacrosInSequences?: boolean;
    skipExamples?: boolean;
    activationRegex?: string;
};

export type PresetGenerationSettings = {
    dryAllowedLength?: number;
    dryBase?: number;
    dryMultiplier?: number;
    dryPenaltyLastN?: number;
    drySequenceBreakers?: string[];
    frequencyPenalty?: number;
    minP?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    repetitionPenaltyRange?: number;
    seed?: number;
    stopSequences?: string[];
    streaming?: boolean;
    temperature?: number;
    topA?: number;
    topK?: number;
    topP?: number;
    typicalP?: number;
    tfs?: number;
    xtcProbability?: number;
    xtcThreshold?: number;
    mirostatMode?: number;
    mirostatTau?: number;
    mirostatEta?: number;
    samplerOrder?: number[];
};

export type PresetCollection = {
    activePresetId: string;
    presets: SmileyPreset[];
};

export type SillyTavernImportSummary = {
    importedGenerationFields: string[];
    importedPrompts: number;
    orderedPrompts: number;
    enabledPrompts: number;
    ignoredFields: string[];
};
