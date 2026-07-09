import { describe, expect, test } from "bun:test";

import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { ChatGenerationResult } from "#frontend/lib/connections/types";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { runSummarization, saveSummarizerSettings } from "./daemon";
import { defaultSummarizerSettings, type SummarizerSettings } from "./settings";

describe("chat summarizer daemon", () => {
    test("trims oldest summarized messages to fit the selected context budget", async () => {
        let generatedPrompt = "";
        const api = {
            model: {
                estimateTokens(messages: ChatGenerationMessage[]) {
                    const content = messages
                        .map((message) => String(message.content))
                        .join("\n");

                    return content.includes("Old context.") ? 10 : 2;
                },
                getContextBudget() {
                    return 2;
                },
                async generate(request: {
                    messages: ChatGenerationMessage[];
                }): Promise<ChatGenerationResult> {
                    generatedPrompt = request.messages
                        .map((message) => String(message.content))
                        .join("\n");

                    return {
                        provider: "test",
                        message: "Trimmed summary",
                    };
                },
            },
            storage: {
                async getJson<T>(_key: string, fallback: T) {
                    return fallback;
                },
                async setJson() {},
            },
        } as unknown as SmileyPluginApi;
        const settings: SummarizerSettings = {
            ...defaultSummarizerSettings,
            maxMessagesPerRun: 2,
            profileId: "profile-a",
        };

        await saveSummarizerSettings(api, settings);
        await runSummarization(api, {
            mode: "full",
            snapshot: {
                activeChat: { id: "chat-a" },
                messages: [
                    message("old-message", "Old context."),
                    message("new-message", "New context."),
                ],
            } as never,
        });

        expect(generatedPrompt).not.toContain("Old context.");
        expect(generatedPrompt).toContain("New context.");
    });
});

function message(id: string, content: string) {
    return {
        id,
        activeSwipeIndex: 0,
        author: "Anon",
        createdAt: "2026-01-01T00:00:00.000Z",
        role: "user",
        swipes: [
            {
                id: `${id}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
