import { describe, expect, test } from "bun:test";

import { createConnectionProfile } from "./config";
import { getEffectiveContextTokenBudget } from "./context-budget";

describe("effective connection context budget", () => {
    test("uses the checked-in limit for a locally stored model", () => {
        const profile = createConnectionProfile("openai-compatible");
        profile.config.model = { source: "default", id: "gpt-4o" };
        profile.contextTokenBudget = 128000;

        expect(getEffectiveContextTokenBudget(profile)).toMatchObject({
            source: "local-model",
            totalTokenLimit: 128000,
            reservedOutputTokens: 1000,
            tokenBudget: 127000,
        });
    });

    test("uses local metadata when an API-loaded model ID matches", () => {
        const profile = createConnectionProfile("anthropic");
        profile.config.model = { source: "api", id: "claude-sonnet-4-6" };
        profile.contextTokenBudget = 1_000_000;

        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(999_000);
    });

    test("uses the checked-in NovelAI limit for its selected model", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };
        profile.contextTokenBudget = 32768;

        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(31768);
    });

    test("falls back to 2M for API-only and custom models", () => {
        const profile = createConnectionProfile("xai");
        profile.config.model = { source: "api", id: "grok-private-preview" };
        profile.contextTokenBudget = 2_000_000;

        expect(getEffectiveContextTokenBudget(profile)).toMatchObject({
            source: "fallback",
            totalTokenLimit: 2_000_000,
            reservedOutputTokens: 1000,
            tokenBudget: 1_999_000,
        });

        profile.config.model = { source: "custom", id: "grok-4.5" };
        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(1_999_000);
    });

    test("uses and caps a custom override", () => {
        const profile = createConnectionProfile("google-ai");
        profile.overrideModelContext = true;
        profile.contextTokenBudget = 3_000_000;

        expect(getEffectiveContextTokenBudget(profile)).toMatchObject({
            source: "custom",
            totalTokenLimit: 2_000_000,
            reservedOutputTokens: 1000,
            tokenBudget: 1_999_000,
        });
    });
});
