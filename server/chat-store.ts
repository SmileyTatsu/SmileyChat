import { Glob } from "bun";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestError, writeJsonAtomic } from "./http";
import { chatFilePath } from "./chat-file-paths";
import { moveToUniquePath } from "./character-file-utils";
import { chatIndexPath, chatOrphanedDir, chatSessionsDir } from "./paths";
import {
    chatLastMessageAt,
    chatToSummary,
    normalizeChat,
    normalizeChatSummaryCollection,
} from "../src/lib/chats/normalize";
import type {
    ChatIndex,
    ChatSession,
    ChatSummaryCollection,
} from "../src/lib/chats/types";
import { isRecord } from "../src/lib/common/guards";

export async function readChatSummaryCollection(): Promise<ChatSummaryCollection> {
    const index = await readChatIndex();
    const chats = await readChatsFromIndex(index);
    return normalizeChatSummaryCollection({
        version: 1,
        activeChatIdsByCharacter: index.activeChatIdsByCharacter,
        chats: chats.map(chatToSummary),
    });
}

export async function readChatById(chatId: string) {
    const path = chatFilePath(chatId);

    if (!(await Bun.file(path).exists())) {
        return undefined;
    }

    return normalizeChat({
        ...(await Bun.file(path).json()),
        id: chatId,
    });
}

export async function createChat(value: unknown) {
    const chat = normalizeChat(value);

    if (!chat) {
        throw new BadRequestError("Invalid chat.");
    }

    await writeJsonAtomic(chatFilePath(chat.id), chat);
    const index = await readChatIndex();
    const chatIds = index.chatIds.includes(chat.id)
        ? moveChatIdToFront(index.chatIds, chat.id)
        : [chat.id, ...index.chatIds];
    const nextIndex = {
        version: 1 as const,
        activeChatIdsByCharacter: {
            ...index.activeChatIdsByCharacter,
            [chat.characterId]: chat.id,
        },
        chatIds,
    };

    await writeJsonAtomic(chatIndexPath, nextIndex);

    return {
        chat,
        summary: chatToSummary(chat),
        chats: await readChatSummaryCollection(),
    };
}

export async function writeChatById(chatId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const chat = normalizeChat({
        ...source,
        id: chatId,
    });

    if (!chat) {
        throw new BadRequestError("Invalid chat.");
    }

    const existingChat = await readChatById(chatId);
    if (
        existingChat &&
        timestampMs(existingChat.updatedAt) > timestampMs(chat.updatedAt)
    ) {
        return existingChat;
    }

    await writeJsonAtomic(chatFilePath(chat.id), chat);

    const index = await readChatIndex();
    const chatIds = index.chatIds.includes(chat.id)
        ? moveChatIdToFront(index.chatIds, chat.id)
        : [chat.id, ...index.chatIds];
    await writeJsonAtomic(chatIndexPath, {
        version: 1,
        activeChatIdsByCharacter: {
            ...index.activeChatIdsByCharacter,
            ...(index.activeChatIdsByCharacter[chat.characterId]
                ? {}
                : { [chat.characterId]: chat.id }),
        },
        chatIds,
    });

    return chat;
}

export async function deleteChatById(chatId: string) {
    const chat = await readChatById(chatId);

    if (!chat || !(await Bun.file(chatFilePath(chatId)).exists())) {
        return undefined;
    }

    await rm(chatFilePath(chatId), { force: true });
    const index = await readChatIndex();
    const activeChatIdsByCharacter = { ...index.activeChatIdsByCharacter };

    for (const [characterId, activeChatId] of Object.entries(activeChatIdsByCharacter)) {
        if (activeChatId === chatId) {
            delete activeChatIdsByCharacter[characterId];
        }
    }

    await writeJsonAtomic(chatIndexPath, {
        version: 1,
        activeChatIdsByCharacter,
        chatIds: index.chatIds.filter((item) => item !== chatId),
    });

    return {
        chats: await readChatSummaryCollection(),
    };
}

export async function deleteChatsByCharacterId(characterId: string) {
    const index = await readChatIndex();
    const chats = await readChatsFromIndex(index);
    const deleteIds = new Set(
        chats.filter((chat) => chat.characterId === characterId).map((chat) => chat.id),
    );

    if (deleteIds.size === 0) {
        return {
            deleted: 0,
            chats: await readChatSummaryCollection(),
        };
    }

    for (const chatId of deleteIds) {
        await rm(chatFilePath(chatId), { force: true });
    }

    const activeChatIdsByCharacter = { ...index.activeChatIdsByCharacter };
    delete activeChatIdsByCharacter[characterId];

    await writeJsonAtomic(chatIndexPath, {
        version: 1,
        activeChatIdsByCharacter,
        chatIds: index.chatIds.filter((chatId) => !deleteIds.has(chatId)),
    });

    return {
        deleted: deleteIds.size,
        chats: await readChatSummaryCollection(),
    };
}

export async function updateChatIndex(value: unknown) {
    const current = await readChatIndex();
    const record = isRecord(value) ? value : {};
    const requestedActive = isRecord(record.activeChatIdsByCharacter)
        ? record.activeChatIdsByCharacter
        : {};
    const requestedChatIds = Array.isArray(record.chatIds)
        ? record.chatIds.filter((item): item is string => typeof item === "string")
        : [];
    const activeChatIdsByCharacter = { ...current.activeChatIdsByCharacter };

    for (const [characterId, chatId] of Object.entries(requestedActive)) {
        if (typeof chatId === "string" && current.chatIds.includes(chatId)) {
            activeChatIdsByCharacter[characterId] = chatId;
        }
    }
    const currentChatIds = new Set(current.chatIds);
    const requestedChatIdsSet = new Set<string>();
    const chatIds = [
        ...requestedChatIds.filter((chatId) => {
            if (!currentChatIds.has(chatId) || requestedChatIdsSet.has(chatId)) {
                return false;
            }

            requestedChatIdsSet.add(chatId);
            return true;
        }),
        ...current.chatIds.filter((chatId) => !requestedChatIdsSet.has(chatId)),
    ];

    const nextIndex = {
        version: 1 as const,
        activeChatIdsByCharacter,
        chatIds,
    };

    await writeJsonAtomic(chatIndexPath, nextIndex);
    return nextIndex;
}

async function readChatIndex(): Promise<ChatIndex> {
    if (await Bun.file(chatIndexPath).exists()) {
        try {
            const file = Bun.file(chatIndexPath);
            return repairChatIndex(normalizeChatIndex(await file.json()));
        } catch {
            return rebuildChatIndexFromSessions();
        }
    }

    return rebuildChatIndexFromSessions();
}

async function repairChatIndex(index: ChatIndex): Promise<ChatIndex> {
    const chatIds: string[] = [];

    for (const chatId of index.chatIds) {
        if (await Bun.file(chatFilePath(chatId)).exists()) {
            chatIds.push(chatId);
        }
    }

    if (chatIds.length === index.chatIds.length) {
        return index;
    }

    const chatIdsSet = new Set(chatIds);
    const activeChatIdsByCharacter = Object.fromEntries(
        Object.entries(index.activeChatIdsByCharacter).filter(([, chatId]) =>
            chatIdsSet.has(chatId),
        ),
    );
    const repairedIndex = {
        version: 1 as const,
        activeChatIdsByCharacter,
        chatIds,
    };

    await writeJsonAtomic(chatIndexPath, repairedIndex);
    return repairedIndex;
}

async function rebuildChatIndexFromSessions(): Promise<ChatIndex> {
    const chats: ChatSession[] = [];
    const glob = new Glob("*.json");

    for await (const fileName of glob.scan(chatSessionsDir)) {
        const filePath = join(chatSessionsDir, fileName);

        try {
            const chat = normalizeChat({
                ...(await Bun.file(filePath).json()),
                id: fileName.slice(0, -".json".length),
            });

            if (chat) {
                chats.push(chat);
            }
        } catch {
            await moveToUniquePath(filePath, chatOrphanedDir, fileName);
        }
    }

    const sortedChats = sortChats(chats);
    const index = {
        version: 1 as const,
        activeChatIdsByCharacter: await readActiveChatIds(sortedChats),
        chatIds: sortedChats.map((chat) => chat.id),
    };

    await writeJsonAtomic(chatIndexPath, index);
    return index;
}

async function readChatsFromIndex(index: ChatIndex) {
    const chats: ChatSession[] = [];

    for (const chatId of index.chatIds) {
        const chat = await readChatById(chatId);

        if (chat) {
            chats.push(chat);
        }
    }

    return sortChats(chats);
}

async function readActiveChatIds(chats: ChatSession[]) {
    const activeChatIdsByCharacter: Record<string, string> = {};

    for (const chat of sortChats(chats)) {
        if (!activeChatIdsByCharacter[chat.characterId]) {
            activeChatIdsByCharacter[chat.characterId] = chat.id;
        }
    }

    return activeChatIdsByCharacter;
}

function normalizeChatIndex(value: unknown): ChatIndex {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeChatIdsByCharacter: {},
            chatIds: [],
        };
    }

    const chatIds = Array.isArray(value.chatIds)
        ? Array.from(
              new Set(
                  value.chatIds.filter(
                      (item): item is string => typeof item === "string",
                  ),
              ),
          )
        : [];
    const chatIdsSet = new Set(chatIds);
    const activeChatIdsByCharacter = isRecord(value.activeChatIdsByCharacter)
        ? Object.fromEntries(
              Object.entries(value.activeChatIdsByCharacter).filter(
                  (entry): entry is [string, string] =>
                      typeof entry[1] === "string" && chatIdsSet.has(entry[1]),
              ),
          )
        : {};

    return {
        version: 1,
        activeChatIdsByCharacter,
        chatIds,
    };
}

function sortChats(chats: ChatSession[]) {
    return [...chats].sort((left, right) => {
        const rightTime = timestampMs(chatLastMessageAt(right) || right.updatedAt);
        const leftTime = timestampMs(chatLastMessageAt(left) || left.updatedAt);
        return rightTime - leftTime || right.id.localeCompare(left.id);
    });
}

function moveChatIdToFront(chatIds: string[], chatId: string) {
    return [chatId, ...chatIds.filter((item) => item !== chatId)];
}

function timestampMs(value: string) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
}
