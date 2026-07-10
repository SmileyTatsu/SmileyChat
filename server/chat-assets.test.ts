import { afterEach, describe, expect, test } from "bun:test";

import {
    deleteChatAssetDirectory,
    sanitizeChatAttachmentUrls,
    serveChatAsset,
    writeChatAssets,
} from "./chat-assets";
import type { ChatSession } from "#frontend/types";

const testChatIds = new Set<string>();

afterEach(async () => {
    await Promise.all(
        Array.from(testChatIds).map((chatId) => deleteChatAssetDirectory(chatId)),
    );
    testChatIds.clear();
});

describe("chat assets", () => {
    test("forces HTML attachments to download with a safe content type", async () => {
        const chatId = testChatId("html");
        const [attachment] = await writeChatAssets(chatId, [
            new File(["<script>alert('xss')</script>"], "payload.html", {
                type: "text/html",
            }),
        ]);

        const response = await serveChatAsset(chatId, attachment.id);

        expect(attachment.type).toBe("file");
        expect(attachment.mimeType).toStartWith("text/html");
        expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    test("treats SVG uploads as downloadable files instead of inline images", async () => {
        const chatId = testChatId("svg");
        const [attachment] = await writeChatAssets(chatId, [
            new File(["<svg><script>alert('xss')</script></svg>"], "icon.svg", {
                type: "image/svg+xml",
            }),
        ]);

        const response = await serveChatAsset(chatId, attachment.id);

        expect(attachment.type).toBe("file");
        expect(attachment.mimeType).toBe("image/svg+xml");
        expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(response.headers.get("Content-Disposition")).toStartWith("attachment;");
    });

    test("serves safe raster image attachments inline", async () => {
        const chatId = testChatId("png");
        const [attachment] = await writeChatAssets(chatId, [
            new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", {
                type: "image/png",
            }),
        ]);

        const response = await serveChatAsset(chatId, attachment.id);

        expect(attachment.type).toBe("image");
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(response.headers.get("Content-Disposition")).toStartWith("inline;");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    test("strips attachment urls that are not local to the chat", () => {
        const chat = createChatWithAttachments([
            {
                id: "local",
                type: "image",
                url: "/api/chats/chat_safe/attachments/image.png",
                name: "image.png",
            },
            {
                id: "other-chat",
                type: "image",
                url: "/api/chats/chat_other/attachments/image.png",
                name: "other.png",
            },
            {
                id: "external",
                type: "image",
                url: "https://example.com/tracker.png",
                name: "tracker.png",
            },
            {
                id: "javascript",
                type: "file",
                url: "javascript:alert(1)",
                name: "payload.html",
            },
            {
                id: "query",
                type: "file",
                url: "/api/chats/chat_safe/attachments/file.txt?download=1",
                name: "file.txt",
            },
        ]);

        const sanitized = sanitizeChatAttachmentUrls(chat);

        expect(sanitized.messages[0].swipes[0].attachments).toEqual([
            {
                id: "local",
                type: "image",
                url: "/api/chats/chat_safe/attachments/image.png",
                name: "image.png",
            },
        ]);
    });

    test("preserves unchanged legacy attachment urls during an existing chat save", () => {
        const legacyAttachment = {
            id: "legacy-generated",
            type: "image" as const,
            url: "data:image/png;base64,iVBORw0KGgo=",
            name: "Generated image",
        };
        const existingChat = createChatWithAttachments([legacyAttachment]);
        const incomingChat = createChatWithAttachments([
            legacyAttachment,
            {
                id: "new-external",
                type: "image",
                url: "https://example.com/tracker.png",
                name: "tracker.png",
            },
        ]);

        const sanitized = sanitizeChatAttachmentUrls(incomingChat, existingChat);

        expect(sanitized.messages[0].swipes[0].attachments).toEqual([legacyAttachment]);
    });

    test("preserves source legacy attachments when forking into a new chat id", () => {
        const legacyAttachment = {
            id: "legacy-generated",
            type: "image" as const,
            url: "https://cdn.example.com/generated.png",
            name: "Generated image",
        };
        const sourceChat = createChatWithAttachments([legacyAttachment]);
        const forkedChat = {
            ...createChatWithAttachments([legacyAttachment]),
            id: "chat_fork",
        };

        const sanitized = sanitizeChatAttachmentUrls(forkedChat, sourceChat);

        expect(sanitized.messages[0].swipes[0].attachments).toEqual([legacyAttachment]);
    });
});

function testChatId(label: string) {
    const chatId = `chat-assets-${label}-${Bun.randomUUIDv7()}`;
    testChatIds.add(chatId);
    return chatId;
}

function createChatWithAttachments(
    attachments: NonNullable<
        ChatSession["messages"][number]["swipes"][number]["attachments"]
    >,
): ChatSession {
    return {
        id: "chat_safe",
        version: 1,
        characterId: "character_1",
        defaultTitle: "Test chat",
        mode: "chat",
        messages: [
            {
                id: "message_1",
                author: "Anon",
                role: "user",
                createdAt: "2026-07-09T00:00:00.000Z",
                activeSwipeIndex: 0,
                swipes: [
                    {
                        id: "swipe_1",
                        content: "",
                        attachments,
                        createdAt: "2026-07-09T00:00:00.000Z",
                    },
                ],
            },
        ],
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
    };
}
