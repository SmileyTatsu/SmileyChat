import { describe, expect, test } from "bun:test";
import { normalizeConnectionSettings } from "./config";

describe("connection config normalization", () => {
    test("normalizes connection context token budgets", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-openai",
            profiles: [
                {
                    id: "profile-openai",
                    name: "OpenAI",
                    provider: "openai-compatible",
                    contextTokenBudget: 250000,
                    config: {
                        baseUrl: "https://api.openai.com/v1",
                        model: {
                            source: "default",
                            id: "gpt-4o-mini",
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.contextTokenBudget).toBe(200000);
    });

    test("normalizes valid Google AI thinking config", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-google",
            profiles: [
                {
                    id: "profile-google",
                    name: "Google",
                    provider: "google-ai",
                    config: {
                        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                        model: {
                            source: "default",
                            id: "gemini-3.1-flash-lite",
                        },
                        thinking: {
                            includeThoughts: true,
                            mode: "level",
                            thinkingLevel: "medium",
                            thinkingBudget: -1,
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            thinking: {
                includeThoughts: true,
                mode: "level",
                thinkingLevel: "medium",
                thinkingBudget: -1,
            },
        });
    });

    test("drops invalid Google AI thinking config values", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-google",
            profiles: [
                {
                    id: "profile-google",
                    name: "Google",
                    provider: "google-ai",
                    config: {
                        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                        model: {
                            source: "default",
                            id: "gemini-3.1-flash-lite",
                        },
                        thinking: {
                            includeThoughts: "yes",
                            mode: "deep",
                            thinkingLevel: "extreme",
                            thinkingBudget: -2,
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).not.toHaveProperty("thinking");
    });

    test("normalizes valid Anthropic thinking config", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-anthropic",
            profiles: [
                {
                    id: "profile-anthropic",
                    name: "Anthropic",
                    provider: "anthropic",
                    config: {
                        baseUrl: "https://api.anthropic.com/v1",
                        model: {
                            source: "default",
                            id: "claude-sonnet-4-6",
                        },
                        thinking: {
                            mode: "adaptive",
                            effort: "high",
                            display: "summarized",
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            thinking: {
                mode: "adaptive",
                effort: "high",
                display: "summarized",
            },
        });
    });

    test("drops invalid Anthropic thinking config values", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-anthropic",
            profiles: [
                {
                    id: "profile-anthropic",
                    name: "Anthropic",
                    provider: "anthropic",
                    config: {
                        baseUrl: "https://api.anthropic.com/v1",
                        model: {
                            source: "default",
                            id: "claude-sonnet-4-6",
                        },
                        thinking: {
                            mode: "deep",
                            effort: "extreme",
                            display: "full",
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).not.toHaveProperty("thinking");
    });
});
