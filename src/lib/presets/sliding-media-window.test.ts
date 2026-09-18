import { describe, expect, test } from "bun:test";
import type { Message, ChatAttachment } from "#frontend/types";
import {
    formatAttachmentContextText,
    formatActiveAttachmentDescription,
    getActiveBinaryAttachmentIds,
} from "./sliding-media-window";

function makeMessage(
    id: string,
    author: string,
    content: string,
    attachments: ChatAttachment[] = [],
): Message {
    return {
        id,
        author,
        role: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${id}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
                attachments,
            },
        ],
    };
}

describe("sliding-media-window", () => {
    test("always includes attachments on the latest message turn", () => {
        const att1: ChatAttachment = { id: "img-1", type: "image", url: "/img1.png" };
        const att2: ChatAttachment = { id: "img-2", type: "image", url: "/img2.png" };
        const att3: ChatAttachment = { id: "img-3", type: "image", url: "/img3.png" };

        const messages = [
            makeMessage("m1", "user", "Look at these", [att1, att2, att3]),
        ];

        const active = getActiveBinaryAttachmentIds(messages);
        expect(active.has("img-1")).toBe(true);
        expect(active.has("img-2")).toBe(true);
        expect(active.has("img-3")).toBe(true);
    });

    test("limits historical binary images to maxActiveImages", () => {
        const oldImg1: ChatAttachment = { id: "old-1", type: "image", url: "/old1.png" };
        const oldImg2: ChatAttachment = { id: "old-2", type: "image", url: "/old2.png" };
        const oldImg3: ChatAttachment = { id: "old-3", type: "image", url: "/old3.png" };
        const latestImg: ChatAttachment = { id: "latest-1", type: "image", url: "/latest.png" };

        const messages = [
            makeMessage("m1", "user", "First", [oldImg1]),
            makeMessage("m2", "assistant", "Saw first"),
            makeMessage("m3", "user", "Second and third", [oldImg2, oldImg3]),
            makeMessage("m4", "assistant", "Saw them"),
            makeMessage("m5", "user", "Latest", [latestImg]),
        ];

        const active = getActiveBinaryAttachmentIds(messages, { maxActiveImages: 2 });
        // latest is always included
        expect(active.has("latest-1")).toBe(true);
        // from m3 (distance 2): oldImg3 and oldImg2 are within the 2 historical slots
        expect(active.has("old-3")).toBe(true);
        expect(active.has("old-2")).toBe(true);
        // from m1 (older): slot exhausted, so old-1 is excluded
        expect(active.has("old-1")).toBe(false);
    });

    test("demotes attachments beyond maxMessageDistance", () => {
        const veryOldImg: ChatAttachment = { id: "very-old", type: "image", url: "/vold.png" };
        const messages = [
            makeMessage("m1", "user", "Old image", [veryOldImg]),
            makeMessage("m2", "assistant", "Reply 1"),
            makeMessage("m3", "user", "Chat 2"),
            makeMessage("m4", "assistant", "Reply 2"),
            makeMessage("m5", "user", "Chat 3"),
            makeMessage("m6", "assistant", "Reply 3"),
            makeMessage("m7", "user", "Chat 4"),
            makeMessage("m8", "assistant", "Reply 4"),
        ];

        const active = getActiveBinaryAttachmentIds(messages, { maxMessageDistance: 5 });
        expect(active.has("very-old")).toBe(false);
    });

    test("formats context text correctly for aged out attachments", () => {
        expect(
            formatAttachmentContextText({
                id: "1",
                type: "image",
                url: "/1.png",
                name: "outfit.png",
                description: "Emerald velvet dress",
            }),
        ).toBe('[Attached image: "Emerald velvet dress" (outfit.png)]');

        expect(
            formatAttachmentContextText({
                id: "2",
                type: "image",
                url: "/2.png",
                description: "A sunny beach",
            }),
        ).toBe('[Attached image: "A sunny beach"]');

        expect(
            formatAttachmentContextText({
                id: "3",
                type: "image",
                url: "/3.png",
                name: "photo.jpg",
            }),
        ).toBe("[Attached image: photo.jpg]");

        expect(
            formatAttachmentContextText({
                id: "4",
                type: "file",
                url: "/doc.pdf",
                name: "lore.pdf",
                description: "Kingdom history",
            }),
        ).toBe('[Attached file: "Kingdom history" (lore.pdf)]');

        expect(
            formatAttachmentContextText({
                id: "5",
                type: "image",
                url: "/img.png",
            }),
        ).toBe("[Attached image]");
    });

    test("formats active attachment description note", () => {
        expect(
            formatActiveAttachmentDescription({
                id: "1",
                type: "image",
                url: "/1.png",
                description: "Silver sword",
            }),
        ).toBe('[Image context: "Silver sword"]');

        expect(
            formatActiveAttachmentDescription({
                id: "2",
                type: "image",
                url: "/2.png",
            }),
        ).toBeUndefined();
    });
});
