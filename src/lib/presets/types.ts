export type PresetPromptRole = "system" | "user" | "assistant";

export type PresetInjectionPosition = "none" | "before" | "after";
export type PresetPromptAnchor =
    | "after-character"
    | "after-history"
    | "after-scenario"
    | "before-character"
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
    metadata?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type PresetGenerationSettings = {
    frequencyPenalty?: number;
    minP?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    seed?: number;
    stopSequences?: string[];
    temperature?: number;
    topA?: number;
    topK?: number;
    topP?: number;
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
