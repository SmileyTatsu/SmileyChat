import { describe, expect, test } from "bun:test";

import {
    filterLocalChatGenerationMessageAttachments,
    messageContentToText,
} from "./images";

describe("messageContentToText", () => {
    test("renders file placeholders without exposing base64 content", () => {
        expect(
            messageContentToText([
                { type: "text", text: "Read this" },
                {
                    type: "file",
                    file: {
                        filename: "notes.txt",
                        file_data: "data:text/plain;base64,SGVsbG8=",
                    },
                },
            ]),
        ).toBe("Read this\n[file: notes.txt]");
    });
});

describe("filterLocalChatGenerationMessageAttachments", () => {
    test("keeps local and legacy image urls, strips other-chat files", () => {
        const [message] = filterLocalChatGenerationMessageAttachments(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Look" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "/api/chats/chat_1/attachments/image.png",
                            },
                        },
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/image.png" },
                        },
                        {
                            type: "file",
                            file: {
                                url: "/api/chats/chat_2/attachments/notes.txt",
                                filename: "notes.txt",
                            },
                        },
                    ],
                },
            ],
            "chat_1",
        );

        expect(message?.content).toEqual([
            { type: "text", text: "Look" },
            {
                type: "image_url",
                image_url: {
                    url: "/api/chats/chat_1/attachments/image.png",
                },
            },
            {
                type: "image_url",
                image_url: { url: "https://example.com/image.png" },
            },
        ]);
    });

    test("drops a structured message when every attachment is rejected", () => {
        expect(
            filterLocalChatGenerationMessageAttachments(
                [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: { url: "javascript:alert(1)" },
                            },
                            {
                                type: "file",
                                file: {
                                    url: "https://example.com/doc.pdf",
                                    filename: "doc.pdf",
                                },
                            },
                        ],
                    },
                ],
                "chat_1",
            ),
        ).toEqual([]);
    });
});
