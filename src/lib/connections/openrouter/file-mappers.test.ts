import { describe, expect, test } from "bun:test";

import { createOpenRouterResponsesBody } from "./mappers";

describe("OpenRouter file mappers", () => {
    test("builds a Responses payload with file and image inputs", () => {
        const body = createOpenRouterResponsesBody(
            {
                messages: [],
                promptMessages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Summarize this." },
                            {
                                type: "file",
                                file: {
                                    filename: "notes.txt",
                                    url: "file-123",
                                },
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: "data:image/png;base64,abc",
                                },
                            },
                        ],
                    },
                ],
            },
            {
                model: { source: "api", id: "openai/gpt-5.5" },
                providerPreferences: {},
            },
        );

        expect(body.input[0]).toEqual({
            role: "user",
            content: [
                { type: "input_text", text: "Summarize this." },
                { type: "input_file", file_id: "file-123", filename: "notes.txt" },
                { type: "input_image", image_url: "data:image/png;base64,abc" },
            ],
        });
    });
});
