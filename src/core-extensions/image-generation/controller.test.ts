import { describe, expect, test } from "bun:test";

import type { SmileyPluginApi, PluginAppSnapshot } from "#frontend/lib/plugins/types";

import {
    buildPromptWriterMessages,
    isNovelAIImageGenerationAvailable,
    parsePromptWriterResult,
} from "./controller";
import { defaultImageGenerationSettings } from "./settings";

describe("image prompt writer response", () => {
    test("accepts fenced JSON and keeps only the insertion", () => {
        expect(
            parsePromptWriterResult(
                '```json\n{"roleMap":[{"role":"Subject","purpose":"focus"}],"prompt":"1girl, red dress","label":"A red-haired woman wearing a red dress.","notes":[]}\n```',
            ),
        ).toEqual({
            roleMap: [{ role: "Subject", purpose: "focus" }],
            prompt: "1girl, red dress",
            label: "A red-haired woman wearing a red dress.",
            notes: [],
        });
    });

    test("rejects prose and empty prompt fields", () => {
        expect(() => parsePromptWriterResult("Here is your prompt")).toThrow(
            "invalid structured response",
        );
        expect(() => parsePromptWriterResult('{"prompt":""}')).toThrow("empty prompt");
        expect(() =>
            parsePromptWriterResult('{"prompt":"1girl","label":""}', true),
        ).toThrow("empty label");
    });

    test("extracts the internal JSON object when a model adds prose", () => {
        expect(
            parsePromptWriterResult(
                'Here is the result: {"roleMap":[],"prompt":"1girl, solo","label":"A solo portrait.","notes":[]}',
            ).prompt,
        ).toBe("1girl, solo");
    });
});

describe("image prompt writer context", () => {
    test("includes only the configured number of recent messages", () => {
        const snapshot = {
            mode: "chatting",
            messages: [
                message("oldest-message", "user"),
                message("kept-message-one", "assistant"),
                message("kept-message-two", "user"),
            ],
            character: {
                id: "character",
                data: {
                    name: "Character",
                    description: "Description",
                    personality: "Personality",
                    scenario: "Scenario",
                    first_mes: "",
                    mes_example: "",
                    extensions: {},
                },
            },
            persona: { name: "User", description: "Persona" },
            userStatus: "online",
            presetCollection: { activePresetId: "missing", presets: [] },
        } as unknown as PluginAppSnapshot;
        const settings = {
            ...defaultImageGenerationSettings,
            promptWriterHistoryLimit: 2,
        };

        const serialized = JSON.stringify(
            buildPromptWriterMessages(snapshot, settings, "custom", "draw this"),
        );

        expect(serialized).not.toContain("oldest-message");
        expect(serialized).toContain("kept-message-one");
        expect(serialized).toContain("kept-message-two");
        expect(serialized).toContain("draw this");
    });

    test("zero recent messages does not accidentally include the full history", () => {
        const snapshot = {
            mode: "chatting",
            messages: [message("must-not-leak", "user")],
            character: {
                id: "character",
                data: {
                    name: "Character",
                    description: "Description",
                    personality: "Personality",
                    scenario: "Scenario",
                    first_mes: "",
                    mes_example: "",
                    extensions: {},
                },
            },
            persona: { name: "User", description: "Persona" },
            userStatus: "online",
            presetCollection: { activePresetId: "missing", presets: [] },
        } as unknown as PluginAppSnapshot;
        const settings = {
            ...defaultImageGenerationSettings,
            promptWriterHistoryLimit: 0,
        };

        expect(
            JSON.stringify(
                buildPromptWriterMessages(snapshot, settings, "custom", "draw this"),
            ),
        ).not.toContain("must-not-leak");
    });
});

describe("image tool availability", () => {
    test("uses the core secret accessor with sanitized profile snapshots", () => {
        const snapshot = {
            connectionSettings: {
                activeProfileId: "novelai-profile",
                profiles: [
                    {
                        id: "novelai-profile",
                        name: "NovelAI Images",
                        provider: "novelai",
                        config: { apiKey: undefined },
                    },
                ],
            },
        } as unknown as PluginAppSnapshot;
        const api = {
            connections: {
                hasApiKey: (profileId: string) => profileId === "novelai-profile",
            },
        } as unknown as SmileyPluginApi;

        expect(
            isNovelAIImageGenerationAvailable(
                api,
                snapshot,
                defaultImageGenerationSettings,
            ),
        ).toBe(true);
    });
});

function message(content: string, role: "assistant" | "user") {
    return {
        id: content,
        author: role === "user" ? "User" : "Character",
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${content}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
