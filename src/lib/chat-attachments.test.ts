import { describe, expect, test } from "bun:test";

import {
    isAnyLocalChatAttachmentUrl,
    isLegacyGeneratedImageUrl,
    isLocalChatAttachmentUrl,
    isRenderableChatImageUrl,
    isSafeGeneratedImageFetchUrl,
    localChatAttachmentFileName,
} from "./chat-attachments";

describe("chat attachment URLs", () => {
    test("accepts only exact local attachment paths for the current chat", () => {
        const valid = "/api/chats/chat_1/attachments/image.png";

        expect(isLocalChatAttachmentUrl(valid, "chat_1")).toBe(true);
        expect(localChatAttachmentFileName(valid, "chat_1")).toBe("image.png");
        expect(isLocalChatAttachmentUrl(valid, "chat_2")).toBe(false);
        expect(isLocalChatAttachmentUrl(`${valid}?download=1`, "chat_1")).toBe(false);
        expect(isLocalChatAttachmentUrl(`${valid}#preview`, "chat_1")).toBe(false);
    });

    test("rejects encoded path segments and traversal names", () => {
        expect(
            isLocalChatAttachmentUrl(
                "/api/chats/chat_1/attachments/folder%2Fimage.png",
                "chat_1",
            ),
        ).toBe(false);
        expect(
            isLocalChatAttachmentUrl("/api/chats/chat_1/attachments/..", "chat_1"),
        ).toBe(false);
        expect(
            isAnyLocalChatAttachmentUrl("/api/chats/chat%2Fother/attachments/image.png"),
        ).toBe(false);
    });

    test("allows legacy generated image schemes for display and fetch", () => {
        expect(isLegacyGeneratedImageUrl("https://cdn.example.com/a.png")).toBe(true);
        expect(isLegacyGeneratedImageUrl("http://127.0.0.1:8080/out.png")).toBe(true);
        expect(isLegacyGeneratedImageUrl("data:image/png;base64,abc")).toBe(true);
        expect(isLegacyGeneratedImageUrl("data:image/svg+xml,<svg></svg>")).toBe(false);
        expect(isLegacyGeneratedImageUrl("javascript:alert(1)")).toBe(false);
        expect(isSafeGeneratedImageFetchUrl("http://localhost:1234/img.png")).toBe(true);
        expect(isRenderableChatImageUrl("https://cdn.example.com/a.png", "chat_1")).toBe(
            true,
        );
        expect(
            isRenderableChatImageUrl("/api/chats/chat_1/attachments/a.png", "chat_1"),
        ).toBe(true);
        expect(
            isRenderableChatImageUrl("/api/chats/chat_2/attachments/a.png", "chat_1"),
        ).toBe(false);
    });
});
