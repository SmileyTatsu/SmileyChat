import { rm } from "node:fs/promises";

import {
    chatLastMessageAt,
    chatDisplayTitle,
    chatToSummary,
    isGroupChat,
    normalizeChat,
    normalizeChatSummaryCollection,
} from "#frontend/lib/chats/normalize";
import { createId } from "#frontend/lib/common/ids";
import type {
    ChatIndex,
    ChatSession,
    ChatSummaryCollection,
} from "#frontend/lib/chats/types";
import { isRecord } from "#frontend/lib/common/guards";

import {
    copyChatMessageAssets,
    deleteChatAssetDirectory,
    sanitizeChatAttachmentUrls,
} from "./chat-assets";
import { chatFilePath } from "./chat-file-paths";
import {
    discoverJsonFiles,
    readEntitiesFromIds,
    readExistingIdsInOrder,
    readFileBackedIndex,
    writeFileBackedIndex,
} from "./file-store";
import { BadRequestError, NotFoundError, writeJsonAtomic } from "./http";
import { chatIndexPath, chatOrphanedDir, chatSessionsDir } from "./paths";

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

    const chat = normalizeChat({
        ...(await Bun.file(path).json()),
        id: chatId,
    });

    return chat;
}

export async function createChat(
    value: unknown,
    options: { preserveAttachmentsFrom?: ChatSession } = {},
) {
    const normalizedChat = normalizeChat(value);
    const chat = normalizedChat
        ? sanitizeChatAttachmentUrls(normalizedChat, options.preserveAttachmentsFrom)
        : undefined;

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
        activeChatIdsByCharacter: isGroupChat(chat)
            ? index.activeChatIdsByCharacter
            : {
                  ...index.activeChatIdsByCharacter,
                  [chat.characterId]: chat.id,
              },
        chatIds,
    };

    await writeFileBackedIndex(chatIndexPath, nextIndex);

    return {
        chat,
        summary: chatToSummary(chat),
        chats: await readChatSummaryCollection(),
    };
}

export async function forkChatAtMessage(chatId: string, value: unknown) {
    const sourceChat = await readChatById(chatId);

    if (!sourceChat) {
        throw new NotFoundError("Chat not found.");
    }

    const now = new Date().toISOString();
    const forkId = createId("chat");
    const forkChat = createForkedChatDraft({
        forkId,
        messageId: isRecord(value) ? asString(value.messageId) : "",
        now,
        sourceChat,
    });
    const forkMessages = await copyChatMessageAssets(
        sourceChat.id,
        forkId,
        forkChat.messages,
    );

    return createChat(
        {
            ...forkChat,
            messages: forkMessages,
        },
        { preserveAttachmentsFrom: sourceChat },
    );
}

export function createForkedChatDraft({
    forkId,
    messageId,
    now,
    sourceChat,
}: {
    forkId: string;
    messageId: string;
    now: string;
    sourceChat: ChatSession;
}): ChatSession {
    const targetIndex = sourceChat.messages.findIndex(
        (message) => message.id === messageId,
    );

    if (!messageId || targetIndex < 0) {
        throw new BadRequestError("Choose a message from this chat to fork.");
    }

    return {
        id: forkId,
        version: 1,
        ...(isGroupChat(sourceChat)
            ? {
                  kind: "group" as const,
                  members: sourceChat.members,
                  group: sourceChat.group,
              }
            : {}),
        characterId: sourceChat.characterId,
        defaultTitle: `Fork of ${chatDisplayTitle(sourceChat)}`,
        mode: sourceChat.mode,
        ...(sourceChat.metadata ? { metadata: sourceChat.metadata } : {}),
        messages: sourceChat.messages.slice(0, targetIndex + 1),
        createdAt: now,
        updatedAt: now,
    };
}

export async function writeChatById(chatId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const normalizedChat = normalizeChat({
        ...source,
        id: chatId,
    });
    if (!normalizedChat) {
        throw new BadRequestError("Invalid chat.");
    }

    const existingChat = await readChatById(chatId);
    const chat = sanitizeChatAttachmentUrls(normalizedChat, existingChat);
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
    await writeFileBackedIndex(chatIndexPath, {
        version: 1,
        activeChatIdsByCharacter: isGroupChat(chat)
            ? index.activeChatIdsByCharacter
            : {
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
    await deleteChatAssetDirectory(chatId);
    const index = await readChatIndex();
    const activeChatIdsByCharacter = { ...index.activeChatIdsByCharacter };

    for (const [characterId, activeChatId] of Object.entries(activeChatIdsByCharacter)) {
        if (activeChatId === chatId) {
            delete activeChatIdsByCharacter[characterId];
        }
    }

    await writeFileBackedIndex(chatIndexPath, {
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
        chats
            .filter((chat) =>
                isGroupChat(chat)
                    ? (chat.members ?? []).some(
                          (member) => member.characterId === characterId,
                      )
                    : chat.characterId === characterId,
            )
            .map((chat) => chat.id),
    );

    if (deleteIds.size === 0) {
        return {
            deleted: 0,
            chats: await readChatSummaryCollection(),
        };
    }

    for (const chatId of deleteIds) {
        await rm(chatFilePath(chatId), { force: true });
        await deleteChatAssetDirectory(chatId);
    }

    const activeChatIdsByCharacter = { ...index.activeChatIdsByCharacter };
    delete activeChatIdsByCharacter[characterId];

    await writeFileBackedIndex(chatIndexPath, {
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
        if (typeof chatId !== "string" || !current.chatIds.includes(chatId)) {
            continue;
        }

        const chat = await readChatById(chatId);

        if (chat && !isGroupChat(chat)) {
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

    await writeFileBackedIndex(chatIndexPath, nextIndex);
    return nextIndex;
}

async function readChatIndex(): Promise<ChatIndex> {
    return readFileBackedIndex({
        indexPath: chatIndexPath,
        normalizeIndex: normalizeChatIndex,
        repairIndex: repairChatIndex,
        rebuildIndex: rebuildChatIndexFromSessions,
    });
}

async function repairChatIndex(index: ChatIndex): Promise<ChatIndex> {
    const chatIds = await readExistingIdsInOrder(index.chatIds, chatFilePath);

    if (chatIds.length === index.chatIds.length) {
        return index;
    }

    const directChatIds = await directChatIdsFromIndex(chatIds);
    const activeChatIdsByCharacter = Object.fromEntries(
        Object.entries(index.activeChatIdsByCharacter).filter(([, chatId]) =>
            directChatIds.has(chatId),
        ),
    );
    const repairedIndex = {
        version: 1 as const,
        activeChatIdsByCharacter,
        chatIds,
    };

    await writeFileBackedIndex(chatIndexPath, repairedIndex);
    return repairedIndex;
}

async function rebuildChatIndexFromSessions(): Promise<ChatIndex> {
    const chats = await discoverJsonFiles<ChatSession>({
        directory: chatSessionsDir,
        orphanedDirectory: chatOrphanedDir,
        normalizeFile: (value, fileName) => {
            const chat = normalizeChat({
                ...(isRecord(value) ? value : {}),
                id: fileName.slice(0, -".json".length),
            });

            return chat;
        },
    });

    const sortedChats = sortChats(chats);
    const index = {
        version: 1 as const,
        activeChatIdsByCharacter: await readActiveChatIds(sortedChats),
        chatIds: sortedChats.map((chat) => chat.id),
    };

    await writeFileBackedIndex(chatIndexPath, index);
    return index;
}

async function readChatsFromIndex(index: ChatIndex) {
    const chats = await readEntitiesFromIds(index.chatIds, readChatById);
    return sortChats(chats);
}

async function readActiveChatIds(chats: ChatSession[]) {
    const activeChatIdsByCharacter: Record<string, string> = {};

    for (const chat of sortChats(chats)) {
        if (!isGroupChat(chat) && !activeChatIdsByCharacter[chat.characterId]) {
            activeChatIdsByCharacter[chat.characterId] = chat.id;
        }
    }

    return activeChatIdsByCharacter;
}

async function directChatIdsFromIndex(chatIds: string[]) {
    const directChatIds = new Set<string>();

    for (const chatId of chatIds) {
        const chat = await readChatById(chatId);

        if (chat && !isGroupChat(chat)) {
            directChatIds.add(chatId);
        }
    }

    return directChatIds;
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

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}
