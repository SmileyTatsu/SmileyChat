import { isRecord } from "#frontend/lib/common/guards";
import { createId } from "#frontend/lib/common/ids";
import { getMessageCreatedAt } from "#frontend/lib/messages";

import type { ChatMode, Message, MessageSwipe } from "#frontend/types";

import type { ChatSession, ChatSummary, ChatSummaryCollection } from "./types";

export function normalizeChat(value: unknown): ChatSession | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const now = new Date().toISOString();
    const id = asString(value.id) || createId("chat");
    const characterId = asString(value.characterId);

    if (!characterId) {
        return undefined;
    }

    const defaultTitle = asString(value.defaultTitle).trim() || "New chat";
    const title = asString(value.title).trim();
    const messages = Array.isArray(value.messages)
        ? value.messages
              .map(normalizeMessage)
              .filter((message): message is Message => Boolean(message))
        : [];

    return {
        id,
        version: 1,
        characterId,
        defaultTitle,
        ...(title ? { title } : {}),
        mode: normalizeMode(value.mode),
        messages,
        createdAt: asIsoString(value.createdAt) || now,
        updatedAt: asIsoString(value.updatedAt) || now,
    };
}

export function normalizeChatSummary(value: unknown): ChatSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const characterId = asString(value.characterId);
    const defaultTitle = asString(value.defaultTitle).trim() || "New chat";
    const title = asString(value.title).trim();

    if (!id || !characterId) {
        return undefined;
    }

    return {
        id,
        characterId,
        defaultTitle,
        ...(title ? { title } : {}),
        mode: normalizeMode(value.mode),
        messageCount: asNonNegativeInteger(value.messageCount),
        ...(asIsoString(value.lastMessageAt)
            ? { lastMessageAt: asIsoString(value.lastMessageAt) }
            : {}),
        createdAt: asIsoString(value.createdAt) || new Date().toISOString(),
        updatedAt: asIsoString(value.updatedAt) || new Date().toISOString(),
    };
}

export function normalizeChatSummaryCollection(value: unknown): ChatSummaryCollection {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeChatIdsByCharacter: {},
            chats: [],
        };
    }

    const chats = Array.isArray(value.chats)
        ? value.chats
              .map(normalizeChatSummary)
              .filter((chat): chat is ChatSummary => Boolean(chat))
        : [];
    const chatIds = new Set(chats.map((chat) => chat.id));
    const activeChatIdsByCharacter = normalizeActiveChatIds(
        value.activeChatIdsByCharacter,
        chatIds,
    );

    for (const chat of chats) {
        if (!activeChatIdsByCharacter[chat.characterId]) {
            activeChatIdsByCharacter[chat.characterId] = chat.id;
        }
    }

    return {
        version: 1,
        activeChatIdsByCharacter,
        chats,
    };
}

export function chatToSummary(chat: ChatSession): ChatSummary {
    return {
        id: chat.id,
        characterId: chat.characterId,
        defaultTitle: chat.defaultTitle,
        ...(chat.title ? { title: chat.title } : {}),
        mode: chat.mode,
        messageCount: chat.messages.length,
        ...(chatLastMessageAt(chat) ? { lastMessageAt: chatLastMessageAt(chat) } : {}),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
    };
}

export function chatDisplayTitle(
    chat: Pick<ChatSession | ChatSummary, "defaultTitle" | "title">,
) {
    return chat.title?.trim() || chat.defaultTitle;
}

export function chatLastMessageAt(chat: Pick<ChatSession, "messages">) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    return lastMessage ? getMessageCreatedAt(lastMessage) : "";
}

function normalizeMessage(value: unknown): Message | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id) || createId("message");
    const role =
        value.role === "user" || value.role === "character" ? value.role : undefined;
    const author = asString(value.author);
    const authorAvatarPath = asString(value.authorAvatarPath);
    const authorPersonaId = asString(value.authorPersonaId);

    if (!role || !author) {
        return undefined;
    }

    const createdAt = asIsoString(value.createdAt) || new Date().toISOString();
    const swipes = Array.isArray(value.swipes)
        ? value.swipes
              .map(normalizeSwipe)
              .filter((swipe): swipe is MessageSwipe => Boolean(swipe))
        : [];
    const safeSwipes = swipes.length
        ? swipes
        : [
              {
                  id: createId("swipe"),
                  content: "",
                  createdAt,
              },
          ];
    const activeSwipeIndex = clampInteger(
        value.activeSwipeIndex,
        0,
        safeSwipes.length - 1,
    );

    return {
        id,
        author,
        ...(authorAvatarPath ? { authorAvatarPath } : {}),
        ...(authorPersonaId ? { authorPersonaId } : {}),
        role,
        createdAt,
        activeSwipeIndex,
        swipes: safeSwipes,
    };
}

function normalizeSwipe(value: unknown): MessageSwipe | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return {
        id: asString(value.id) || createId("swipe"),
        content: asString(value.content),
        createdAt: asIsoString(value.createdAt) || new Date().toISOString(),
        ...(asString(value.reasoning) ? { reasoning: asString(value.reasoning) } : {}),
        ...("reasoningDetails" in value
            ? { reasoningDetails: value.reasoningDetails }
            : {}),
        ...(value.status === "error" ? { status: "error" as const } : {}),
    };
}

function normalizeMode(value: unknown): ChatMode {
    return value === "rp" ? "rp" : "chat";
}

function normalizeActiveChatIds(value: unknown, chatIds: Set<string>) {
    if (!isRecord(value)) {
        return {};
    }

    const output: Record<string, string> = {};

    for (const [characterId, chatId] of Object.entries(value)) {
        if (typeof chatId === "string" && chatIds.has(chatId)) {
            output[characterId] = chatId;
        }
    }

    return output;
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function asIsoString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}

function asNonNegativeInteger(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function clampInteger(value: unknown, min: number, max: number) {
    if (!Number.isInteger(value)) {
        return min;
    }

    return Math.min(max, Math.max(min, Number(value)));
}
