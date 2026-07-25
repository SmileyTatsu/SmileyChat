import { describe, expect, test } from "bun:test";

import { createConnectionProfile } from "./config";
import { getEffectiveContextTokenBudget } from "./context-budget";

describe("effective connection context budget", () => {
    test("uses the checked-in limit for a locally stored model", () => {
        const profile = createConnectionProfile("openai-compatible");
        profile.config.model = { source: "default", id: "gpt-4o" };

        expect(getEffectiveContextTokenBudget(profile)).toEqual({
            source: "local-model",
            tokenBudget: 128000,
        });
    });

    test("uses local metadata when an API-loaded model ID matches", () => {
        const profile = createConnectionProfile("anthropic");
        profile.config.model = { source: "api", id: "claude-sonnet-4-6" };

        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(1_000_000);
    });

    test("uses the checked-in NovelAI limit for its selected model", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };

        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(32768);
    });

    test("falls back to 2M for API-only and custom models", () => {
        const profile = createConnectionProfile("xai");
        profile.config.model = { source: "api", id: "grok-private-preview" };

        expect(getEffectiveContextTokenBudget(profile)).toEqual({
            source: "fallback",
            tokenBudget: 2_000_000,
        });

        profile.config.model = { source: "custom", id: "grok-4.5" };
        expect(getEffectiveContextTokenBudget(profile).tokenBudget).toBe(2_000_000);
    });

    test("uses and caps a custom override", () => {
        const profile = createConnectionProfile("google-ai");
        profile.overrideModelContext = true;
        profile.contextTokenBudget = 3_000_000;

        expect(getEffectiveContextTokenBudget(profile)).toEqual({
            source: "custom",
            tokenBudget: 2_000_000,
        });
    });
});
