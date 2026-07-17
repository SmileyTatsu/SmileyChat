import { describe, expect, test } from "bun:test";

import { normalizeCharacter } from "../characters/normalize";
import { normalizeChat } from "../chats/normalize";
import { normalizePersona } from "../personas/normalize";
import { normalizePreset } from "../presets/normalize";

describe("metadata preservation", () => {
    test("preserves chat metadata", () => {
        const chat = normalizeChat({
            id: "chat-1",
            characterId: "char-1",
            defaultTitle: "Chat",
            mode: "chat",
            metadata: {
                lorebookIds: ["book-1"],
                loreState: {
                    entries: {
                        entryA: {
                            cooldownUntilTurn: 4,
                        },
                    },
                },
                custom: { ok: true },
            },
            messages: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(chat?.metadata?.lorebookIds).toEqual(["book-1"]);
        expect(chat?.metadata?.custom).toEqual({ ok: true });
    });

    test("migrates legacy MCP selections into chat tool groups", () => {
        const chat = normalizeChat({
            id: "chat-1",
            characterId: "char-1",
            defaultTitle: "Chat",
            mode: "chat",
            metadata: {
                mcp: { serverIds: ["local-files", "local-files", "search"] },
                enabledToolGroups: ["workspace-tools:workspace-tools"],
                custom: true,
            },
            messages: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(chat?.metadata?.enabledToolGroups).toEqual([
            "workspace-tools:workspace-tools",
            "smiley-mcp:local-files",
            "smiley-mcp:search",
        ]);
        expect(chat?.metadata?.mcp).toBeUndefined();
        expect(chat?.metadata?.custom).toBe(true);
    });

    test("preserves chat file attachments during normalization", () => {
        const chat = normalizeChat({
            id: "chat-1",
            characterId: "char-1",
            defaultTitle: "Chat",
            mode: "chat",
            messages: [
                {
                    id: "message-1",
                    author: "Anon",
                    role: "user",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    activeSwipeIndex: 0,
                    swipes: [
                        {
                            id: "swipe-1",
                            content: "Edited text",
                            createdAt: "2026-01-01T00:00:00.000Z",
                            attachments: [
                                {
                                    id: "notes.txt",
                                    type: "file",
                                    url: "/api/chats/chat-1/attachments/notes.txt",
                                    name: "notes.txt",
                                    mimeType: "text/plain",
                                    sizeBytes: 12,
                                },
                            ],
                        },
                    ],
                },
            ],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(chat?.messages[0]?.swipes[0]?.attachments).toEqual([
            {
                id: "notes.txt",
                type: "file",
                url: "/api/chats/chat-1/attachments/notes.txt",
                name: "notes.txt",
                mimeType: "text/plain",
                sizeBytes: 12,
            },
        ]);
    });

    test("preserves character metadata", () => {
        const character = normalizeCharacter({
            id: "char-1",
            data: { name: "Luna" },
            metadata: {
                primaryLorebookId: "book-1",
                lorebookIds: ["book-2"],
                custom: "value",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(character?.metadata?.primaryLorebookId).toBe("book-1");
        expect(character?.metadata?.lorebookIds).toEqual(["book-2"]);
        expect(character?.metadata?.custom).toBe("value");
    });

    test("preserves persona metadata", () => {
        const persona = normalizePersona({
            id: "persona-1",
            name: "Anon",
            description: "",
            metadata: {
                lorebookIds: ["book-1"],
                custom: 12,
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(persona?.metadata?.lorebookIds).toEqual(["book-1"]);
        expect(persona?.metadata?.custom).toBe(12);
    });

    test("preserves preset metadata and extensions", () => {
        const preset = normalizePreset({
            id: "preset-1",
            title: "Preset",
            prompts: [],
            promptOrder: [],
            metadata: {
                lorebookIds: ["book-1"],
                custom: true,
            },
            extensions: {
                smileychat: {
                    unknownPresetFields: {
                        example: "value",
                    },
                },
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        expect(preset.metadata?.lorebookIds).toEqual(["book-1"]);
        expect(preset.metadata?.custom).toBe(true);
        expect(preset.extensions?.smileychat).toEqual({
            unknownPresetFields: {
                example: "value",
            },
        });
    });
});
