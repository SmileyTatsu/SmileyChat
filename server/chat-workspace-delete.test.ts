import { describe, expect, test } from "bun:test";

import type { ChatSummary } from "#frontend/lib/chats/types";

import { groupWorkspaceChatIds } from "./chat-store";

describe("group workspace deletion selection", () => {
    test("selects the workspace and all of its conversations, but not other chats", () => {
        const summaries = [
            groupSummary("workspace-a", "workspace"),
            groupSummary("conversation-a-1", "conversation", "workspace-a"),
            groupSummary("conversation-a-2", "conversation", "workspace-a"),
            groupSummary("workspace-b", "workspace"),
            directSummary("direct-chat"),
        ];

        const ids = groupWorkspaceChatIds(summaries, "workspace-a");

        expect(ids).toEqual(["workspace-a", "conversation-a-1", "conversation-a-2"]);
    });
});

function groupSummary(
    id: string,
    role: "workspace" | "conversation",
    groupId?: string,
): ChatSummary {
    return {
        id,
        kind: "group",
        characterId: "character-a",
        defaultTitle: id,
        members: [{ characterId: "character-a", name: "Ari", order: 0 }],
        metadata: {
            smileychatGroup: { groupId: groupId ?? id, role },
        },
        mode: "chat",
        messageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function directSummary(id: string): ChatSummary {
    return {
        id,
        characterId: "character-b",
        defaultTitle: id,
        mode: "chat",
        messageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
