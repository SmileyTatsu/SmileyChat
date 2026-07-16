import { selectHistoryMessagesForBudget } from "../prompt/history-budget";
import { estimateChatGenerationMessages } from "../prompt/token-estimator";
import { compilePresetMessages } from "./compile";
import type { SmileyPreset } from "./types";

const contextEstimatePaddingTokens = 1024;

type PresetContextInput = Parameters<typeof compilePresetMessages>[1];

/** Prefer `buildPromptForGeneration` for the live send path. */
export function preparePresetContextForBudget({
    context,
    preset,
    tokenBudget,
}: {
    context: PresetContextInput;
    preset: SmileyPreset | undefined;
    tokenBudget: number;
}) {
    const staticPromptMessages = compilePresetMessages(preset, {
        ...context,
        messages: [],
    });
    const staticPromptTokens = estimateChatGenerationMessages(staticPromptMessages);
    const historyMessages = selectHistoryMessagesForBudget({
        messages: context.messages,
        availableHistoryTokens: Math.max(
            0,
            tokenBudget - staticPromptTokens - contextEstimatePaddingTokens,
        ),
    });
    const promptMessages = compilePresetMessages(preset, {
        ...context,
        historyMessages,
        messages: context.messages,
    });

    return {
        messages: historyMessages,
        promptMessages,
    };
}
