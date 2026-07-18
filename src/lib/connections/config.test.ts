import { describe, expect, test } from "bun:test";
import { normalizeConnectionSettings, sanitizeConnectionSettings } from "./config";

describe("connection config normalization", () => {
    test("preserves a valid cached OpenAI-compatible model catalog", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-openai",
            profiles: [
                {
                    id: "profile-openai",
                    name: "OpenAI",
                    provider: "openai-compatible",
                    config: {
                        baseUrl: "https://api.openai.com/v1",
                        cachedModels: [{ id: "gpt-custom" }],
                        model: { source: "api", id: "gpt-custom" },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            cachedModels: [
                { id: "gpt-custom", object: "model", created: 0, owned_by: "" },
            ],
        });
    });

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

    test("normalizes NovelAI profiles", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-novelai",
            profiles: [
                {
                    id: "profile-novelai",
                    name: "NovelAI",
                    provider: "novelai",
                    config: {
                        apiKey: "secret",
                        model: {
                            source: "default",
                            id: "kayra-v1",
                        },
                        maxOutputTokens: 512,
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            apiKey: "secret",
            maxOutputTokens: 512,
            model: {
                source: "default",
                id: "kayra-v1",
            },
        });
    });

    test("normalizes xAI profiles and sanitizes API keys from settings", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-xai",
            profiles: [
                {
                    id: "profile-xai",
                    name: "xAI",
                    provider: "xai",
                    config: {
                        apiKey: "secret",
                        baseUrl: "",
                        model: {
                            source: "default",
                            id: "grok-4.5",
                        },
                        maxCompletionTokens: 512,
                        reasoning: {
                            enabled: true,
                            effort: "high",
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            apiKey: "secret",
            baseUrl: "https://api.x.ai/v1",
            maxCompletionTokens: 512,
            model: {
                source: "default",
                id: "grok-4.5",
            },
            reasoning: {
                enabled: true,
                effort: "high",
            },
        });

        const sanitized = sanitizeConnectionSettings(settings);
        expect("apiKey" in (sanitized.profiles[0]?.config ?? {})).toBe(true);
        expect(sanitized.profiles[0]?.config.apiKey).toBeUndefined();
    });

    test("drops invalid xAI reasoning config values", () => {
        const settings = normalizeConnectionSettings({
            version: 1,
            activeProfileId: "profile-xai",
            profiles: [
                {
                    id: "profile-xai",
                    name: "xAI",
                    provider: "xai",
                    config: {
                        model: {
                            source: "default",
                            id: "grok-4.5",
                        },
                        reasoning: {
                            enabled: true,
                            effort: "extreme",
                        },
                    },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        });

        expect(settings.profiles[0]?.config).toMatchObject({
            reasoning: {
                enabled: true,
            },
        });
        expect(settings.profiles[0]?.config).toMatchObject({
            reasoning: {
                enabled: true,
            },
        });
        expect(settings.profiles[0]?.config).not.toMatchObject({
            reasoning: {
                effort: expect.any(String),
            },
        });
    });
});
