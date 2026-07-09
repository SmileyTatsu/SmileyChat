import { describe, expect, test } from "bun:test";

import {
    createUserMessage,
    getMessageAttachments,
    updateActiveSwipeAttachments,
} from "./messages";
import type { ChatAttachment, SmileyPersona } from "../types";

const persona: SmileyPersona = {
    id: "persona-1",
    version: 1,
    name: "Anon",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

const noteAttachment: ChatAttachment = {
    id: "notes.txt",
    type: "file",
    url: "/api/chats/chat-1/attachments/notes.txt",
    name: "notes.txt",
    mimeType: "text/plain",
    sizeBytes: 12,
};

const imageAttachment: ChatAttachment = {
    id: "image.png",
    type: "image",
    url: "/api/chats/chat-1/attachments/image.png",
    name: "image.png",
};

describe("updateActiveSwipeAttachments", () => {
    test("replaces active swipe attachments", () => {
        const message = createUserMessage("hello", persona, [noteAttachment]);
        const updated = updateActiveSwipeAttachments(message, [imageAttachment]);

        expect(getMessageAttachments(updated)).toEqual([imageAttachment]);
    });

    test("clears active swipe attachments when given an empty list", () => {
        const message = createUserMessage("hello", persona, [
            noteAttachment,
            imageAttachment,
        ]);
        const updated = updateActiveSwipeAttachments(message, []);

        expect(getMessageAttachments(updated)).toEqual([]);
        expect(updated.swipes[0]).not.toHaveProperty("attachments");
    });
});
