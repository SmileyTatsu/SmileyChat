import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("chat saves preserve selection and explicit null clears it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smileychat-selection-"));
    try {
        // Isolate module mocks in a subprocess and keep all writes out of userData.
        const result = Bun.spawnSync(
            [
                process.execPath,
                "-e",
                `
            import { mock } from "bun:test";
            import { join } from "node:path";
            import { mkdir } from "node:fs/promises";
            import { strict as assert } from "node:assert";
            const originalPaths = await import("./server/paths.ts");
            const directory = process.env.CHAT_SELECTION_TEST_DIR;
            mock.module("./server/paths.ts", () => ({
                ...originalPaths,
                chatIndexPath: join(directory, "index.json"),
                chatSessionsDir: join(directory, "sessions"),
                chatOrphanedDir: join(directory, "orphaned"),
            }));
            await mkdir(join(directory, "sessions"), { recursive: true });
            const store = await import("./server/chat-store.ts");
            const chat = {
                id: "group-1", version: 1, kind: "group", characterId: "char-1",
                members: [{ characterId: "char-1", name: "One", order: 0 }],
                defaultTitle: "Group", mode: "chat", messages: [],
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            };
            await store.createChat(chat);
            await store.writeChatById(chat.id, { ...chat, title: "Saved group" });
            assert.equal((await store.readChatSummaryCollection()).lastActiveChatId, chat.id);
            await store.patchChatMetadataById(chat.id, { title: "Renamed group" });
            assert.equal((await store.readChatSummaryCollection()).lastActiveChatId, chat.id);
            await store.updateChatIndex({});
            assert.equal((await store.readChatSummaryCollection()).lastActiveChatId, chat.id);
            await store.updateChatIndex({ lastActiveChatId: null });
            assert.equal((await store.readChatSummaryCollection()).lastActiveChatId, undefined);
            const diskIndex = await Bun.file(join(directory, "index.json")).json();
            assert.equal(diskIndex.lastActiveChatId, undefined);
            await store.updateChatIndex({ lastActiveChatId: chat.id });
            assert.equal((await store.readChatSummaryCollection()).lastActiveChatId, chat.id);
            `,
            ],
            {
                cwd: join(import.meta.dir, ".."),
                env: { ...process.env, CHAT_SELECTION_TEST_DIR: directory },
                stdout: "pipe",
                stderr: "pipe",
            },
        );
        expect(result.stderr.toString()).toBe("");
        expect(result.exitCode).toBe(0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
