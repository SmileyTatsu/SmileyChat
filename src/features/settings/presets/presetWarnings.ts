import { dynamicPromptIds } from "../../../lib/presets/defaults";
import type { PresetPrompt, SmileyPreset } from "../../../lib/presets/types";

export function collectPresetWarnings(
    preset: SmileyPreset | undefined,
    selectedPrompt: PresetPrompt | undefined,
) {
    if (!preset) {
        return ["No active preset is available."];
    }

    const warnings: string[] = [];
    const promptById = new Map(preset.prompts.map((prompt) => [prompt.id, prompt]));
    const enabledPrompts = preset.promptOrder
        .filter((entry) => entry.enabled)
        .map((entry) => promptById.get(entry.promptId))
        .filter((prompt): prompt is PresetPrompt => Boolean(prompt));
    const activeHistoryPrompt = enabledPrompts.find(
        (prompt) => prompt.id === dynamicPromptIds.chatHistory,
    );
    const historyMacroPrompts = enabledPrompts.filter((prompt) =>
        hasChatHistoryMacro(prompt.content),
    );
    const macroHistoryPrompt = historyMacroPrompts[0];
    const effectiveHistoryPrompt = macroHistoryPrompt ?? activeHistoryPrompt;
    const hasHistoryMacro = historyMacroPrompts.length > 0;
    const hasInjectedPrompt = enabledPrompts.some(
        (prompt) => prompt.injectionPosition !== "none",
    );

    if (enabledPrompts.length === 0) {
        warnings.push(
            "No prompts are enabled. The provider will receive very little context.",
        );
    }

    if (!effectiveHistoryPrompt) {
        warnings.push(
            "No active Chat History insertion prompt was found. The provider will not receive conversation history from this preset.",
        );
    }

    if (historyMacroPrompts.length > 1) {
        warnings.push(
            `Multiple enabled prompts contain {{chat_history}}. SmileyChat uses "${historyMacroPrompts[0].title}" as the insertion point, but later history macros can duplicate the conversation in the provider context.`,
        );
    }

    if (!hasHistoryMacro) {
        if (activeHistoryPrompt) {
            warnings.push(
                `SmileyChat is using the internal prompt called "${activeHistoryPrompt.title}" as the chat history fallback because its ID is "${dynamicPromptIds.chatHistory}". Add {{chat_history}} to a prompt if you want the preset file to choose the insertion point explicitly.`,
            );
        } else {
            warnings.push(
                "No enabled prompt contains the {{chat_history}} macro, and no internal Chat History fallback prompt is enabled.",
            );
        }
    }

    if (hasInjectedPrompt && !effectiveHistoryPrompt) {
        warnings.push(
            "Injected prompts need a Chat History insertion point to be placed reliably in the conversation.",
        );
    }

    if (selectedPrompt && selectedPrompt.content.trim().length === 0) {
        warnings.push("The selected prompt is empty and will be omitted.");
    }

    if (
        selectedPrompt &&
        selectedPrompt.injectionPosition !== "none" &&
        (!Number.isFinite(selectedPrompt.injectionDepth) ||
            selectedPrompt.injectionDepth < 0)
    ) {
        warnings.push("The selected prompt has an invalid injection depth.");
    }

    return warnings;
}

export function warningsForPromptDeletion(prompt: PresetPrompt) {
    const warnings: string[] = [];

    if (
        prompt.id === dynamicPromptIds.chatHistory ||
        hasChatHistoryMacro(prompt.content)
    ) {
        warnings.push("This prompt appears to control chat history insertion.");
    }

    if (prompt.id === dynamicPromptIds.character) {
        warnings.push("This prompt appears to provide character information.");
    }

    if (prompt.id === dynamicPromptIds.scenario) {
        warnings.push("This prompt appears to provide scenario information.");
    }

    return warnings;
}

function hasChatHistoryMacro(content: string) {
    return /\{\{\s*chat_history\s*\}\}/i.test(content);
}
