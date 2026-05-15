export type PresetPromptRole = "system" | "user" | "assistant";

export type PresetInjectionPosition = "none" | "before" | "after";

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
};

export type PresetPromptOrderEntry = {
    promptId: string;
    enabled: boolean;
};

export type ScyllaPreset = {
    id: string;
    title: string;
    prompts: PresetPrompt[];
    promptOrder: PresetPromptOrderEntry[];
    createdAt: string;
    updatedAt: string;
};

export type PresetCollection = {
    activePresetId: string;
    presets: ScyllaPreset[];
};

export type SillyTavernImportSummary = {
    importedPrompts: number;
    orderedPrompts: number;
    enabledPrompts: number;
    ignoredFields: string[];
};
