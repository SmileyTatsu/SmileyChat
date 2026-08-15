import { describe, expect, test } from "bun:test";

import {
    appendMessageSwipe,
    createInjectedMessage,
    createUserMessage,
    getMessageAttachments,
    removeActiveMessageSwipe,
    updateActiveSwipeAttachments,
} from "./messages";
import type { ChatAttachment, SmileyPersona } from "../types";
import { defaultCharacter } from "./characters/defaults";

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

describe("persona dialogue color snapshots", () => {
    test("captures the sending persona's normalized dialogue color", () => {
        const message = createUserMessage("hello", {
            ...persona,
            dialogueColor: "#28A5D5",
        });

        expect(message.metadata?.authorDialogueColorSnapshot).toBe("#28a5d5");
    });

    test("keeps different personas' dialogue colors on their respective messages", () => {
        const first = createUserMessage("first", {
            ...persona,
            dialogueColor: "#d59a28",
        });
        const second = createUserMessage("second", {
            ...persona,
            id: "persona-2",
            dialogueColor: "#28a5d5",
        });

        expect(first.metadata?.authorDialogueColorSnapshot).toBe("#d59a28");
        expect(second.metadata?.authorDialogueColorSnapshot).toBe("#28a5d5");
    });

    test("uses no custom color when the persona has no configured color", () => {
        const message = createUserMessage("hello", persona);

        expect(message.metadata?.authorDialogueColorSnapshot).toBeUndefined();
    });

    test("captures the persona color for plugin-injected user messages", () => {
        const message = createInjectedMessage("user", "hello", {
            activeCharacter: defaultCharacter,
            persona: { ...persona, dialogueColor: "#28A5D5" },
            pluginId: "test-plugin",
        });

        expect(message.metadata?.authorDialogueColorSnapshot).toBe("#28a5d5");
    });
});

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

describe("appendMessageSwipe", () => {
    test("creates a clean user swipe without changing the original attachments", () => {
        const message = createUserMessage("first version", persona, [noteAttachment]);
        const updated = appendMessageSwipe(message, "second version");

        expect(updated.activeSwipeIndex).toBe(1);
        expect(updated.swipes).toHaveLength(2);
        expect(updated.swipes[0]).toMatchObject({
            content: "first version",
            attachments: [noteAttachment],
        });
        expect(updated.swipes[1]).toMatchObject({ content: "second version" });
        expect(updated.swipes[1]).not.toHaveProperty("attachments");
    });

    test("keeps adjacent conversation messages intact when one user message gains a swipe", () => {
        const first = createUserMessage("first version", persona);
        const following = createUserMessage("later message", persona);
        const messages = [first, following];
        const updatedMessages = messages.map((message) =>
            message.id === first.id
                ? appendMessageSwipe(message, "second version")
                : message,
        );

        expect(updatedMessages[0]?.swipes).toHaveLength(2);
        expect(updatedMessages[1]).toBe(following);
        expect(updatedMessages[1]?.swipes[0]?.content).toBe("later message");
    });

    test("removes a provisional empty swipe and restores the prior active swipe", () => {
        const message = createUserMessage("first version", persona, [noteAttachment]);
        const withProvisionalSwipe = appendMessageSwipe(message, "");
        const cancelled = removeActiveMessageSwipe(withProvisionalSwipe);

        expect(cancelled.activeSwipeIndex).toBe(0);
        expect(cancelled.swipes).toHaveLength(1);
        expect(getMessageAttachments(cancelled)).toEqual([noteAttachment]);
        expect(cancelled.swipes[0]?.content).toBe("first version");
    });
});
