import { describe, expect, test } from "bun:test";

import {
    maxChatAssetBytes,
    maxChatAttachmentsPerMessage,
    validateChatAttachmentFiles,
} from "./chat-attachment-limits";

describe("chat attachment limits", () => {
    test("uses the image limit only for safe raster image files", () => {
        const result = validateChatAttachmentFiles([
            file("image.png", "image/png", maxChatAssetBytes + 1),
            file("image.svg", "image/svg+xml", maxChatAssetBytes + 1),
        ]);

        expect(result.acceptedFiles.map((item) => item.name)).toEqual(["image.svg"]);
        expect(result.errors).toEqual(["image.png exceeds the 25 MB limit."]);
    });

    test("rejects selections above the per-message attachment cap", () => {
        const files = Array.from(
            { length: maxChatAttachmentsPerMessage + 1 },
            (_, index) => file(`file-${index}.txt`, "text/plain", 1),
        );

        expect(validateChatAttachmentFiles(files)).toEqual({
            acceptedFiles: [],
            errors: [
                `A message can include up to ${maxChatAttachmentsPerMessage} attachments.`,
            ],
        });
    });
});

function file(name: string, type: string, size: number) {
    return { name, type, size } as File;
}
