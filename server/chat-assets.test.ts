import { afterEach, describe, expect, test } from "bun:test";

import { deleteChatAssetDirectory, serveChatAsset, writeChatAssets } from "./chat-assets";

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
});

function testChatId(label: string) {
    const chatId = `chat-assets-${label}-${Bun.randomUUIDv7()}`;
    testChatIds.add(chatId);
    return chatId;
}
