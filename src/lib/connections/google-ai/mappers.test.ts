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
});
