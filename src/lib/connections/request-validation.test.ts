import { describe, expect, test } from "bun:test";

import { createConnectionProfile } from "./config";
import { flattenCatalogModels, prepareGenerationRequest } from "./request-validation";
import defaultNovelAIModels from "#frontend/data/default-novelai-models.json";

describe("request validation", () => {
    test("flattens NovelAI's legacy root catalog shape", () => {
        expect(
            flattenCatalogModels(defaultNovelAIModels).map((model) => model.id),
        ).toContain("llama-3-erato-v1");
    });

    test("caps Erato native output tokens from catalog metadata", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };
        (profile.config as { maxOutputTokens?: number }).maxOutputTokens = 1_000;

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect(
            (prepared.profile.config as { maxOutputTokens?: number }).maxOutputTokens,
        ).toBe(250);
        expect(prepared.changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "maxOutputTokens",
                    requested: 1_000,
                    applied: 250,
                    reason: "maximum",
                }),
            ]),
        );
    });

    test("caps an unset Erato output setting using the mapper fallback value", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };
        delete (profile.config as { maxOutputTokens?: number }).maxOutputTokens;

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect(
            (prepared.profile.config as { maxOutputTokens?: number }).maxOutputTokens,
        ).toBe(250);
        expect(prepared.changes[0]).toMatchObject({
            field: "maxOutputTokens",
            requested: undefined,
            applied: 250,
        });
    });

    test("removes unsupported controls but preserves stop sequences", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };
        (profile.config as { maxOutputTokens?: number }).maxOutputTokens = 250;
        const prepared = prepareGenerationRequest(profile, {
            messages: [],
            generation: {
                presencePenalty: 0.5,
                stopSequences: ["END"],
                topK: 1.4,
            },
        });

        expect(prepared.request.generation).toEqual({
            stopSequences: ["END"],
            topK: 1,
        });
        expect(prepared.changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "presencePenalty",
                    reason: "unsupported",
                }),
                expect.objectContaining({ field: "topK", applied: 1, reason: "integer" }),
            ]),
        );
    });

    test("uses OpenRouter's loaded parameter list as shared capabilities", () => {
        const profile = createConnectionProfile("openrouter");
        profile.config.model = {
            source: "api",
            id: "provider/model",
            supportedParameters: ["temperature", "stop"],
        };
        const prepared = prepareGenerationRequest(profile, {
            messages: [],
            generation: { temperature: 0.8, topP: 0.9, stopSequences: ["END"] },
        });

        expect(prepared.metadataSource).toBe("openrouter");
        expect(prepared.request.generation).toEqual({
            temperature: 0.8,
            stopSequences: ["END"],
        });
    });

    test("leaves non-finite sampling values untouched for normal config validation", () => {
        const profile = createConnectionProfile("novelai");
        profile.config.model = { source: "default", id: "llama-3-erato-v1" };
        (profile.config as { maxOutputTokens?: number }).maxOutputTokens = 250;
        const prepared = prepareGenerationRequest(profile, {
            messages: [],
            generation: { temperature: Number.NaN },
        });

        expect(prepared.request.generation).toEqual({ temperature: Number.NaN });
        expect(prepared.changes).toEqual([]);
    });

    test("adjusts unsupported Google AI thinking level to default level for gemini-3.7-flash", () => {
        const profile = createConnectionProfile("google-ai");
        profile.config.model = { source: "default", id: "gemini-3.7-flash" };
        (profile.config as Record<string, unknown>).thinking = {
            mode: "level",
            thinkingLevel: "minimal",
        };

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect((prepared.profile.config as Record<string, unknown>).thinking).toEqual({
            mode: "level",
            thinkingLevel: "medium",
        });
        expect(prepared.changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "thinkingLevel",
                    requested: "minimal",
                    applied: "medium",
                    reason: "unsupported",
                }),
            ]),
        );
    });

    test("adjusts unsupported Google AI thinking level for gemini-3.1-flash-lite-image", () => {
        const profile = createConnectionProfile("google-ai");
        profile.config.model = { source: "default", id: "gemini-3.1-flash-lite-image" };
        (profile.config as Record<string, unknown>).thinking = {
            mode: "level",
            thinkingLevel: "low",
        };

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect((prepared.profile.config as Record<string, unknown>).thinking).toEqual({
            mode: "level",
            thinkingLevel: "minimal",
        });
    });

    test("adjusts unsupported Google AI thinking level for gemini-3-pro-preview", () => {
        const profile = createConnectionProfile("google-ai");
        profile.config.model = { source: "default", id: "gemini-3-pro-preview" };
        (profile.config as Record<string, unknown>).thinking = {
            mode: "level",
            thinkingLevel: "medium",
        };

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect((prepared.profile.config as Record<string, unknown>).thinking).toEqual({
            mode: "level",
            thinkingLevel: "high",
        });
    });

    test("preserves supported Google AI thinking level", () => {
        const profile = createConnectionProfile("google-ai");
        profile.config.model = { source: "default", id: "gemini-3.7-flash" };
        (profile.config as Record<string, unknown>).thinking = {
            mode: "level",
            thinkingLevel: "high",
        };

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect((prepared.profile.config as Record<string, unknown>).thinking).toEqual({
            mode: "level",
            thinkingLevel: "high",
        });
        expect(prepared.changes.filter((c) => c.field === "thinkingLevel")).toEqual([]);
    });

    test("removes active thinking on Google AI models that do not support thinking", () => {
        const profile = createConnectionProfile("google-ai");
        profile.config.model = { source: "default", id: "gemma-4-31b-it" };
        (profile.config as Record<string, unknown>).thinking = {
            mode: "level",
            thinkingLevel: "low",
        };

        const prepared = prepareGenerationRequest(profile, { messages: [] });

        expect(
            (prepared.profile.config as Record<string, unknown>).thinking,
        ).toBeUndefined();
        expect(prepared.changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "thinking",
                    reason: "unsupported",
                }),
            ]),
        );
    });
});
