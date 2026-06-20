import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import {
    getCachedActiveSummaryText,
    getChatSummaryState,
    getSummarizerSettings,
    renderSummaryInjection,
} from "./daemon";

export function registerSummaryInjection(api: SmileyPluginApi) {
    api.chat.registerPromptInjector(async (context) => {
        const settings = getSummarizerSettings();

        if (!settings.injectionEnabled) {
            return [];
        }

        const state = await getChatSummaryState(api, context.chat.id);
        const content = renderSummaryInjection(settings, state.summaryText);

        if (!content) {
            return [];
        }

        return [
            {
                id: "chat-summarizer-summary",
                source: "plugin",
                role: settings.injectionRole,
                content,
                anchor: "at-depth",
                depth: settings.injectionDepth,
                order: settings.injectionOrder,
                priority: settings.injectionPriority,
                tokenBudgetBehavior: settings.injectionTokenBudgetBehavior,
                metadata: {
                    chatId: context.chat.id,
                },
            },
        ];
    });

    api.presets.registerMacro("chat_summary", (context) => {
        const settings = getSummarizerSettings();

        if (!settings.macroEnabled) {
            return "";
        }

        return getCachedActiveSummaryText();
    });
}
