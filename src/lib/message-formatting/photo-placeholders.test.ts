import { describe, expect, test } from "bun:test";

import type { ChatAttachment } from "#frontend/types";

import {
    resolvePhotoPlaceholders,
    stabilizePhotoPlaceholders,
} from "./photo-placeholders";

const attachments: ChatAttachment[] = [
    { id: "notes", type: "file", url: "/notes.txt" },
    { id: "photo-a", type: "image", url: "/a.png" },
    { id: "photo-b", type: "image", url: "/b.png" },
];

describe("photo placeholders", () => {
    test("uses image-only zero-based indexes and preserves text order", () => {
        const result = resolvePhotoPlaceholders("Before {{photo[1]}} after", attachments);

        expect(result.segments).toEqual([
            { type: "text", text: "Before " },
            { type: "photo", attachment: attachments[2], imageIndex: 1 },
            { type: "text", text: " after" },
        ]);
        expect([...result.placedAttachmentIds]).toEqual(["photo-b"]);
    });

    test("bare markers include only images not explicitly positioned", () => {
        const result = resolvePhotoPlaceholders(
            "{{photo[0]}} then {{photo}}",
            attachments,
        );

        expect(
            result.segments
                .filter((segment) => segment.type === "photo")
                .map((segment) => segment.attachment.id),
        ).toEqual(["photo-a", "photo-b"]);
    });

    test("supports stable attachment ids", () => {
        const result = resolvePhotoPlaceholders("{{photo:id=photo-b}}", attachments);

        expect(result.segments[0]).toMatchObject({
            type: "photo",
            attachment: { id: "photo-b" },
        });
    });

    test("reports invalid references without claiming an attachment", () => {
        const result = resolvePhotoPlaceholders("{{photo[9]}}", attachments);

        expect(result.segments).toEqual([{ type: "missing", label: "Missing photo 9" }]);
        expect(result.placedAttachmentIds.size).toBe(0);
    });

    test("can resolve a bubble against explicit markers in the whole message", () => {
        const result = resolvePhotoPlaceholders(
            "{{photo}}",
            attachments,
            "<msg>{{photo[0]}}</msg><msg>{{photo}}</msg>",
        );

        expect(
            result.segments
                .filter((segment) => segment.type === "photo")
                .map((segment) => segment.attachment.id),
        ).toEqual(["photo-b"]);
    });

    test("stabilizes valid numeric references while preserving bare and invalid markers", () => {
        expect(
            stabilizePhotoPlaceholders(
                "{{photo[1]}} {{photo}} {{photo[9]}}",
                attachments,
            ),
        ).toBe("{{photo:id=photo-b}} {{photo}} {{photo[9]}}");
    });
});
