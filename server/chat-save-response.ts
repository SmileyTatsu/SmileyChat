import type { ChatSummary } from "#frontend/lib/chats/types";

export function chatSaveResponse(summary: ChatSummary) {
    return { ok: true as const, summary };
}
