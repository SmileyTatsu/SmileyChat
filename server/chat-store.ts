import { rm } from "node:fs/promises";

import {
    chatLastMessageAt,
    chatDisplayTitle,
    chatToSummary,
    isGroupChat,
    isGroupWorkspace,
    groupWorkspaceId,
    normalizeChat,
    normalizeChatSummary,
    normalizeChatSummaryCollection,
} from "#frontend/lib/chats/normalize";
import { createId } from "#frontend/lib/common/ids";
import type {
    ChatIndex,
    ChatSession,
    ChatSummary,
    ChatSummaryCollection,
} from "#frontend/lib/chats/types";
import { isRecord } from "#frontend/lib/common/guards";

import { timestampMs } from "./time";

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
import { logger } from "./logger";
import { chatIndexPath, chatOrphanedDir, chatSessionsDir } from "./paths";
import { withResourceLock, withResourceLocks } from "./resource-lock";

export async function readChatSummaryCollection(): Promise<ChatSummaryCollection> {
    const index = await readChatIndex();
    return normalizeChatSummaryCollection({
        version: 1,
        activeChatIdsByCharacter: index.activeChatIdsByCharacter,
        ...(index.lastActiveChatId ? { lastActiveChatId: index.lastActiveChatId } : {}),
        chats: sortChatSummaries(index.summaries),
    });
}

export async function readChatById(chatId: string) {
    const path = chatFilePath(chatId);

    if (!(await Bun.file(path).exists())) {
        return undefined;
    }

    try {
        const rawJson = await Bun.file(path).json();
        const chat = normalizeChat({
            ...rawJson,
            id: chatId,
        });

        return chat ? sanitizeChatAttachmentUrls(chat) : undefined;
    } catch (error) {
        logger.warn("server", `Could not parse chat JSON for ${chatId}`, {
            error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
    }
}

export async function createChat(value: unknown) {
    const normalizedChat = normalizeChat(value);
    const chat = normalizedChat ? sanitizeChatAttachmentUrls(normalizedChat) : undefined;

    if (!chat) {
        throw new BadRequestError("Invalid chat.");
    }

    await writeJsonAtomic(chatFilePath(chat.id), chat);

    await withResourceLock(chatIndexPath, async () => {
        const freshIndex = await readChatIndex();
        const chatIds = freshIndex.chatIds.includes(chat.id)
            ? moveChatIdToFront(freshIndex.chatIds, chat.id)
            : [chat.id, ...freshIndex.chatIds];
        const nextIndex = {
            version: 1 as const,
            activeChatIdsByCharacter: isGroupChat(chat)
                ? freshIndex.activeChatIdsByCharacter
                : {
                      ...freshIndex.activeChatIdsByCharacter,
                      [chat.characterId]: chat.id,
                  },
            lastActiveChatId: chat.id,
            chatIds,
            summaries: replaceChatSummary(freshIndex.summaries, chatToSummary(chat)),
        };

        await writeFileBackedIndex(chatIndexPath, nextIndex);
    });

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

    return createChat({
        ...forkChat,
        messages: forkMessages,
    });
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
    return withResourceLock(`chat:${chatId}`, () => writeChatByIdUnlocked(chatId, value));
}

async function writeChatByIdUnlocked(chatId: string, value: unknown) {
    const source = isRecord(value) ? value : {};
    const normalizedChat = normalizeChat({
        ...source,
        id: chatId,
    });
    if (!normalizedChat) {
        throw new BadRequestError("Invalid chat.");
    }

    const chat = sanitizeChatAttachmentUrls(normalizedChat);
    const index = await readChatIndex();
    const existingSummary = index.summaries.find((summary) => summary.id === chatId);
    if (existingSummary && shouldPreserveExistingChat(existingSummary, chat)) {
        return existingSummary;
    }

    await writeJsonAtomic(chatFilePath(chat.id), chat);

    await withResourceLock(chatIndexPath, async () => {
        const freshIndex = await readChatIndex();
        const chatIds = freshIndex.chatIds.includes(chat.id)
            ? moveChatIdToFront(freshIndex.chatIds, chat.id)
            : [chat.id, ...freshIndex.chatIds];
        await writeFileBackedIndex(chatIndexPath, {
            version: 1,
            activeChatIdsByCharacter: isGroupChat(chat)
                ? freshIndex.activeChatIdsByCharacter
                : {
                      ...freshIndex.activeChatIdsByCharacter,
                      ...(freshIndex.activeChatIdsByCharacter[chat.characterId]
                          ? {}
                          : { [chat.characterId]: chat.id }),
                  },
            ...(freshIndex.lastActiveChatId
                ? { lastActiveChatId: freshIndex.lastActiveChatId }
                : {}),
            chatIds,
            summaries: replaceChatSummary(freshIndex.summaries, chatToSummary(chat)),
        });
    });

    return chatToSummary(chat);
}

export async function patchChatMetadataById(chatId: string, value: unknown) {
    return withResourceLock(`chat:${chatId}`, async () => {
        const existing = await readChatById(chatId);
        if (!existing) throw new NotFoundError("Chat not found.");
        const patch = isRecord(value) ? value : {};
        const chat = normalizeChat({
            ...existing,
            ...(typeof patch.title === "string" ? { title: patch.title } : {}),
            ...(typeof patch.defaultTitle === "string"
                ? { defaultTitle: patch.defaultTitle }
                : {}),
            ...(typeof patch.mode === "string" ? { mode: patch.mode } : {}),
            ...(isRecord(patch.metadata)
                ? { metadata: { ...existing.metadata, ...patch.metadata } }
                : {}),
            messages: existing.messages,
            updatedAt: new Date().toISOString(),
        });
        if (!chat) throw new BadRequestError("Invalid chat metadata patch.");
        return writeChatByIdUnlocked(chatId, chat);
    });
}

export function shouldPreserveExistingChat(
    existingChat: ChatSummary | undefined,
    incomingChat: ChatSession,
) {
    return (
        existingChat !== undefined &&
        timestampMs(existingChat.updatedAt) > timestampMs(incomingChat.updatedAt)
    );
}

export async function deleteChatById(chatId: string) {
    return withResourceLock(`chat:${chatId}`, async () => {
        const fileExists = await Bun.file(chatFilePath(chatId)).exists();

        if (!fileExists) {
            return undefined;
        }

        await rm(chatFilePath(chatId), { force: true });
        await deleteChatAssetDirectory(chatId);

        await withResourceLock(chatIndexPath, async () => {
            const index = await readChatIndex();
            const activeChatIdsByCharacter = { ...index.activeChatIdsByCharacter };

            for (const [characterId, activeChatId] of Object.entries(
                activeChatIdsByCharacter,
            )) {
                if (activeChatId === chatId) {
                    delete activeChatIdsByCharacter[characterId];
                }
            }

            const lastActiveChatId =
                index.lastActiveChatId === chatId ? undefined : index.lastActiveChatId;

            await writeFileBackedIndex(chatIndexPath, {
                version: 1,
                activeChatIdsByCharacter,
                ...(lastActiveChatId ? { lastActiveChatId } : {}),
                chatIds: index.chatIds.filter((item) => item !== chatId),
                summaries: index.summaries.filter((summary) => summary.id !== chatId),
            });
        });

        return {
            chats: await readChatSummaryCollection(),
        };
    });
}

/**
 * Deletes a group workspace and every conversation that belongs to it as one
 * index transaction. Group conversations share a workspace ID in their
 * metadata, so deleting them through the single-chat route would otherwise
 * rewrite the chat index once for every conversation.
 */
export async function deleteGroupWorkspaceById(workspaceId: string) {
    while (true) {
        const snapshot = await readChatIndex();
        const candidateIds = groupWorkspaceChatIds(snapshot.summaries, workspaceId);
        const workspace = snapshot.summaries.find(
            (summary) => summary.id === workspaceId,
        );

        if (!workspace || !isGroupWorkspace(workspace)) {
            return undefined;
        }

        const result = await withResourceLocks(
            candidateIds.map((id) => `chat:${id}`),
            async () => {
                return withResourceLock(chatIndexPath, async () => {
                    const index = await readChatIndex();
                    const currentWorkspace = index.summaries.find(
                        (summary) => summary.id === workspaceId,
                    );

                    if (!currentWorkspace || !isGroupWorkspace(currentWorkspace)) {
                        return { status: "not_found" as const };
                    }

                    const currentIds = groupWorkspaceChatIds(
                        index.summaries,
                        workspaceId,
                    );
                    if (currentIds.some((id) => !candidateIds.includes(id))) {
                        return { status: "retry" as const };
                    }

                    const deleteIds = new Set(currentIds);
                    await deleteChatRecords(deleteIds);

                    const activeChatIdsByCharacter = Object.fromEntries(
                        Object.entries(index.activeChatIdsByCharacter).filter(
                            ([, chatId]) => !deleteIds.has(chatId),
                        ),
                    );
                    const lastActiveChatId =
                        index.lastActiveChatId && deleteIds.has(index.lastActiveChatId)
                            ? undefined
                            : index.lastActiveChatId;
                    const nextIndex = {
                        version: 1 as const,
                        activeChatIdsByCharacter,
                        ...(lastActiveChatId ? { lastActiveChatId } : {}),
                        chatIds: index.chatIds.filter((chatId) => !deleteIds.has(chatId)),
                        summaries: index.summaries.filter(
                            (summary) => !deleteIds.has(summary.id),
                        ),
                    };

                    await writeFileBackedIndex(chatIndexPath, nextIndex);

                    return {
                        status: "done" as const,
                        value: {
                            deleted: deleteIds.size,
                            chats: toChatSummaryCollection(nextIndex),
                        },
                    };
                });
            },
        );

        if (result.status === "not_found") return undefined;
        if (result.status === "done") return result.value;
    }
}

function getCharacterChatIds(summaries: ChatSummary[], characterId: string): string[] {
    return summaries
        .filter((chat) =>
            isGroupChat(chat)
                ? (chat.members ?? []).some(
                      (member) => member.characterId === characterId,
                  )
                : chat.characterId === characterId,
        )
        .map((chat) => chat.id);
}

export async function deleteChatsByCharacterId(characterId: string) {
    while (true) {
        const snapshot = await readChatIndex();
        const candidateIds = getCharacterChatIds(snapshot.summaries, characterId);

        if (candidateIds.length === 0) {
            return {
                deleted: 0,
                chats: await readChatSummaryCollection(),
            };
        }

        const result = await withResourceLocks(
            candidateIds.map((id) => `chat:${id}`),
            async () => {
                return withResourceLock(chatIndexPath, async () => {
                    const index = await readChatIndex();
                    const currentIds = getCharacterChatIds(index.summaries, characterId);

                    if (currentIds.some((id) => !candidateIds.includes(id))) {
                        return { status: "retry" as const };
                    }

                    const deleteIds = new Set(currentIds);
                    await deleteChatRecords(deleteIds);

                    const activeChatIdsByCharacter = {
                        ...index.activeChatIdsByCharacter,
                    };
                    delete activeChatIdsByCharacter[characterId];
                    const lastActiveChatId =
                        index.lastActiveChatId && deleteIds.has(index.lastActiveChatId)
                            ? undefined
                            : index.lastActiveChatId;

                    await writeFileBackedIndex(chatIndexPath, {
                        version: 1,
                        activeChatIdsByCharacter,
                        ...(lastActiveChatId ? { lastActiveChatId } : {}),
                        chatIds: index.chatIds.filter((chatId) => !deleteIds.has(chatId)),
                        summaries: index.summaries.filter(
                            (summary) => !deleteIds.has(summary.id),
                        ),
                    });

                    return {
                        status: "done" as const,
                        value: {
                            deleted: deleteIds.size,
                            chats: await readChatSummaryCollection(),
                        },
                    };
                });
            },
        );

        if (result.status === "done") return result.value;
    }
}

export function groupWorkspaceChatIds(summaries: ChatSummary[], workspaceId: string) {
    return summaries
        .filter((summary) => groupWorkspaceId(summary) === workspaceId)
        .map((summary) => summary.id);
}

const chatDeletionConcurrency = 8;

async function deleteChatRecords(chatIds: Set<string>) {
    const ids = [...chatIds];
    let nextIndex = 0;
    const workerCount = Math.min(chatDeletionConcurrency, ids.length);

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (nextIndex < ids.length) {
                const chatId = ids[nextIndex];
                nextIndex += 1;

                if (!chatId) continue;

                await Promise.all([
                    rm(chatFilePath(chatId), { force: true }),
                    deleteChatAssetDirectory(chatId),
                ]);
            }
        }),
    );
}

function toChatSummaryCollection(index: ChatIndex): ChatSummaryCollection {
    return normalizeChatSummaryCollection({
        version: 1,
        activeChatIdsByCharacter: index.activeChatIdsByCharacter,
        ...(index.lastActiveChatId ? { lastActiveChatId: index.lastActiveChatId } : {}),
        chats: sortChatSummaries(index.summaries),
    });
}

export async function updateChatIndex(value: unknown) {
    return withResourceLock(chatIndexPath, async () => {
        const current = await readChatIndex();
        const record = isRecord(value) ? value : {};
        const requestedActive = isRecord(record.activeChatIdsByCharacter)
            ? record.activeChatIdsByCharacter
            : {};
        const requestedChatIds = Array.isArray(record.chatIds)
            ? record.chatIds.filter((item): item is string => typeof item === "string")
            : [];
        const activeChatIdsByCharacter = { ...current.activeChatIdsByCharacter };
        const summariesById = new Map(
            current.summaries.map((summary) => [summary.id, summary]),
        );
        const currentChatIds = new Set(current.chatIds);

        for (const [characterId, chatId] of Object.entries(requestedActive)) {
            if (typeof chatId !== "string" || !currentChatIds.has(chatId)) {
                continue;
            }

            const chat = summariesById.get(chatId);

            if (chat && !isGroupChat(chat)) {
                activeChatIdsByCharacter[characterId] = chatId;
            }
        }
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

        const requestedLastActive =
            record.lastActiveChatId === null
                ? undefined
                : typeof record.lastActiveChatId === "string"
                  ? record.lastActiveChatId
                  : current.lastActiveChatId;
        const lastActiveChatId =
            requestedLastActive && currentChatIds.has(requestedLastActive)
                ? requestedLastActive
                : undefined;

        const nextIndex: ChatIndex = {
            version: 1 as const,
            activeChatIdsByCharacter,
            ...(lastActiveChatId ? { lastActiveChatId } : {}),
            chatIds,
            summaries: chatIds.flatMap((chatId) => {
                const summary = summariesById.get(chatId);
                return summary ? [summary] : [];
            }),
        };

        await writeFileBackedIndex(chatIndexPath, nextIndex);
        return nextIndex;
    });
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
    const summariesById = new Map(
        index.summaries.map((summary) => [summary.id, summary]),
    );
    const hasAllSummaries = chatIds.every((chatId) => summariesById.has(chatId));

    if (chatIds.length === index.chatIds.length && hasAllSummaries) {
        return index;
    }

    // Pre-summary indexes are migrated once. Future summary reads stay compact.
    const hydratedSummaries = hasAllSummaries
        ? chatIds.flatMap((chatId) => {
              const summary = summariesById.get(chatId);
              return summary ? [summary] : [];
          })
        : (await readChatsFromIndex({ ...index, chatIds })).map(chatToSummary);
    const directChatIds = new Set(
        hydratedSummaries
            .filter((summary) => !isGroupChat(summary))
            .map((summary) => summary.id),
    );
    const activeChatIdsByCharacter = Object.fromEntries(
        Object.entries(index.activeChatIdsByCharacter).filter(([, chatId]) =>
            directChatIds.has(chatId),
        ),
    );
    const lastActiveChatId =
        typeof index.lastActiveChatId === "string" &&
        hydratedSummaries.some((summary) => summary.id === index.lastActiveChatId)
            ? index.lastActiveChatId
            : undefined;
    const repairedIndex = {
        version: 1 as const,
        activeChatIdsByCharacter,
        ...(lastActiveChatId ? { lastActiveChatId } : {}),
        chatIds,
        summaries: hydratedSummaries,
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

            return chat ? sanitizeChatAttachmentUrls(chat) : undefined;
        },
    });

    const sortedChats = sortChats(chats);
    const index = {
        version: 1 as const,
        activeChatIdsByCharacter: await readActiveChatIds(sortedChats),
        ...(sortedChats[0] ? { lastActiveChatId: sortedChats[0].id } : {}),
        chatIds: sortedChats.map((chat) => chat.id),
        summaries: sortedChats.map(chatToSummary),
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

function normalizeChatIndex(value: unknown): ChatIndex {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeChatIdsByCharacter: {},
            chatIds: [],
            summaries: [],
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
    const summaries = Array.isArray(value.summaries)
        ? value.summaries
              .map(normalizeChatSummary)
              .filter((summary): summary is ChatSummary => Boolean(summary))
              .filter((summary) => chatIdsSet.has(summary.id))
        : [];
    const lastActiveChatId =
        typeof value.lastActiveChatId === "string" &&
        chatIdsSet.has(value.lastActiveChatId)
            ? value.lastActiveChatId
            : undefined;

    return {
        version: 1,
        activeChatIdsByCharacter,
        ...(lastActiveChatId ? { lastActiveChatId } : {}),
        chatIds,
        summaries,
    };
}

function sortChats(chats: ChatSession[]) {
    return [...chats].sort((left, right) => {
        const rightTime = timestampMs(chatLastMessageAt(right) || right.updatedAt);
        const leftTime = timestampMs(chatLastMessageAt(left) || left.updatedAt);
        return rightTime - leftTime || right.id.localeCompare(left.id);
    });
}

function sortChatSummaries(chats: ChatSummary[]) {
    return [...chats].sort((left, right) => {
        const rightTime = timestampMs(right.lastMessageAt || right.updatedAt);
        const leftTime = timestampMs(left.lastMessageAt || left.updatedAt);
        return rightTime - leftTime || right.id.localeCompare(left.id);
    });
}

function replaceChatSummary(summaries: ChatSummary[], summary: ChatSummary) {
    return [summary, ...summaries.filter((item) => item.id !== summary.id)];
}

function moveChatIdToFront(chatIds: string[], chatId: string) {
    return [chatId, ...chatIds.filter((item) => item !== chatId)];
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}
