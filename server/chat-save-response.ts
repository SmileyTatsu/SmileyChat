import { chatToSummary } from "#frontend/lib/chats/normalize";
import type { ChatSession } from "#frontend/lib/chats/types";

export function chatSaveResponse(chat: ChatSession) {
    return { ok: true as const, summary: chatToSummary(chat) };
}
