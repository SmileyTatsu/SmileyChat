import { describe, expect, test } from "bun:test";
import { createGoogleAIGenerateBody, normalizeGoogleAIResponse } from "./mappers";

describe("Google AI connection mappers", () => {
    test("moves system and developer messages into systemInstruction", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [
                    { role: "system", content: "System prompt" },
                    { role: "developer", content: "Developer prompt" },
                    { role: "user", content: "Hello" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
            },
        );

        expect(body.systemInstruction?.parts[0]?.text).toBe(
            "System prompt\n\nDeveloper prompt",
        );
        expect(body.contents).toEqual([
            {
                role: "user",
                parts: [{ text: "Hello" }],
            },
        ]);
    });

    test("merges consecutive same-role turns for Gemini alternation", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [
                    { role: "user", content: "First user" },
                    { role: "user", content: "Second user" },
                    { role: "assistant", content: "First model" },
                    { role: "assistant", content: "Second model" },
                    { role: "user", content: "Third user" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
            },
        );

        expect(body.contents).toEqual([
            {
                role: "user",
                parts: [{ text: "First user\nSecond user" }],
            },
            {
                role: "model",
                parts: [{ text: "First model\nSecond model" }],
            },
            {
                role: "user",
                parts: [{ text: "Third user" }],
            },
        ]);
    });

    test("normalizes the first candidate text", () => {
        const result = normalizeGoogleAIResponse({
            modelVersion: "gemini-test",
            candidates: [
                {
                    content: {
                        role: "model",
                        parts: [{ text: "Hello" }, { text: " there" }],
                    },
                },
            ],
        });

        expect(result).toMatchObject({
            message: "Hello there",
            provider: "google-ai",
            model: "gemini-test",
        });
    });

    test("adds includeThoughts request config", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [{ role: "user", content: "Think aloud" }],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
                thinking: {
                    includeThoughts: true,
                    mode: "auto",
                },
            },
        );

        expect(body.generationConfig?.thinkingConfig).toEqual({
            includeThoughts: true,
        });
    });

    test("adds thinkingLevel request config", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [{ role: "user", content: "Use light reasoning" }],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
                thinking: {
                    mode: "level",
                    thinkingLevel: "low",
                },
            },
        );

        expect(body.generationConfig?.thinkingConfig).toEqual({
            thinkingLevel: "low",
        });
    });

    test("adds thinkingBudget request config", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [{ role: "user", content: "Use a token budget" }],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-2.5-flash" },
                thinking: {
                    mode: "budget",
                    thinkingBudget: 1024,
                },
            },
        );

        expect(body.generationConfig?.thinkingConfig).toEqual({
            thinkingBudget: 1024,
        });
    });

    test("separates thought summary from visible answer", () => {
        const result = normalizeGoogleAIResponse({
            modelVersion: "gemini-test",
            candidates: [
                {
                    content: {
                        role: "model",
                        parts: [
                            { text: "I should reason first.", thought: true },
                            { text: "Final answer." },
                        ],
                    },
                },
            ],
        });

        expect(result).toMatchObject({
            message: "Final answer.",
            reasoning: "I should reason first.",
        });
    });

    test("preserves signed response parts in reasoning details", () => {
        const result = normalizeGoogleAIResponse({
            modelVersion: "gemini-test",
            candidates: [
                {
                    content: {
                        role: "model",
                        parts: [
                            {
                                text: "Final answer.",
                                thoughtSignature: "signature-a",
                            },
                        ],
                    },
                },
            ],
            usageMetadata: {
                thoughtsTokenCount: 12,
            },
        });

        expect(result.reasoningDetails).toEqual({
            googleAI: {
                parts: [
                    {
                        text: "Final answer.",
                        thoughtSignature: "signature-a",
                    },
                ],
                usageMetadata: {
                    thoughtsTokenCount: 12,
                },
                visibleText: "Final answer.",
            },
        });
    });

    test("replays signed parts when assistant history still matches", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [
                    {
                        role: "assistant",
                        content: "Final answer.",
                        reasoningDetails: {
                            googleAI: {
                                parts: [
                                    {
                                        text: "Thinking summary.",
                                        thought: true,
                                    },
                                    {
                                        text: "Final answer.",
                                        thoughtSignature: "signature-a",
                                    },
                                ],
                                visibleText: "Final answer.",
                            },
                        },
                    },
                    { role: "user", content: "Continue" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
            },
        );

        expect(body.contents[0]).toEqual({
            role: "model",
            parts: [
                {
                    text: "Thinking summary.",
                    thought: true,
                },
                {
                    text: "Final answer.",
                    thoughtSignature: "signature-a",
                },
            ],
        });
    });

    test("does not replay signed parts when assistant history was edited", () => {
        const body = createGoogleAIGenerateBody(
            {
                promptMessages: [
                    {
                        role: "assistant",
                        content: "Edited answer.",
                        reasoningDetails: {
                            googleAI: {
                                parts: [
                                    {
                                        text: "Final answer.",
                                        thoughtSignature: "signature-a",
                                    },
                                ],
                                visibleText: "Final answer.",
                            },
                        },
                    },
                    { role: "user", content: "Continue" },
                ],
                messages: [],
            },
            {
                baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                model: { source: "default", id: "gemini-3.1-flash-lite" },
            },
        );

        expect(body.contents[0]).toEqual({
            role: "model",
            parts: [{ text: "Edited answer." }],
        });
    });
});
