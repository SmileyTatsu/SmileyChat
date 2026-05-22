import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import {
    createChat as createChatRequest,
    deleteChatAttachment,
    deleteChat as deleteChatRequest,
    loadChat,
    loadChatSummaries,
    saveChat,
    saveChatIndex,
    uploadChatAttachments,
} from "#frontend/lib/api/client";
import { createChatSession, createGroupChatSession } from "#frontend/lib/chats/defaults";
import {
    chatDisplayTitle,
    chatToSummary,
    defaultGroupTitle,
    isGroupChat,
    normalizeChat,
    normalizeChatSummaryCollection,
} from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import { createCharacterGreetingMessage } from "#frontend/lib/messages";
import { resolvePresetMacros } from "#frontend/lib/presets/macros";
import type {
    CharacterSummaryCollection,
    ChatMode,
    ChatSession,
    ChatSummary,
    ChatSummaryCollection,
    GroupGreetingMode,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

type UseChatLibraryOptions = {
    activeCharacterId: string;
    defaultNewChatMode: ChatMode;
    fetchCharacterById: (characterId: string) => Promise<SmileyCharacter>;
    latestCharacterRef: { current: SmileyCharacter };
    latestCharacterSummariesRef: { current: CharacterSummaryCollection };
    latestPersonaRef: { current: SmileyPersona };
    onDisplayCharacterChange: (character: SmileyCharacter) => void;
    setMode: (mode: ChatMode) => void;
    userStatus: UserStatus;
};

export function useChatLibrary({
    activeCharacterId,
    defaultNewChatMode,
    fetchCharacterById,
    latestCharacterRef,
    latestCharacterSummariesRef,
    latestPersonaRef,
    onDisplayCharacterChange,
    setMode,
    userStatus,
}: UseChatLibraryOptions) {
    const [chatSummaries, setChatSummariesState] = useState<ChatSummaryCollection>({
        version: 1,
        activeChatIdsByCharacter: {},
        chats: [],
    });
    const [activeChat, setActiveChatState] = useState<ChatSession | undefined>();
    const [groupCharacters, setGroupCharactersState] = useState<SmileyCharacter[]>([]);
    const [chatLoadError, setChatLoadError] = useState("");
    const latestChatRef = useRef(activeChat);
    const latestChatSummariesRef = useRef(chatSummaries);
    const latestGroupCharactersRef = useRef(groupCharacters);
    const chatAutosaveTimerRef = useRef<number | undefined>(undefined);
    const chatSaveRequestIdRef = useRef(0);

    latestChatRef.current = activeChat;
    latestChatSummariesRef.current = chatSummaries;
    latestGroupCharactersRef.current = groupCharacters;

    useEffect(
        () => () => {
            clearPendingChatAutosave();
        },
        [],
    );

    function setChatSummaries(nextSummaries: ChatSummaryCollection) {
        const safeSummaries = normalizeChatSummaryCollection(nextSummaries);
        setChatSummariesState(safeSummaries);
        latestChatSummariesRef.current = safeSummaries;
    }

    function setActiveChat(nextChat: ChatSession | undefined) {
        setActiveChatState(nextChat);
        latestChatRef.current = nextChat;
    }

    function setGroupCharacters(nextCharacters: SmileyCharacter[]) {
        setGroupCharactersState(nextCharacters);
        latestGroupCharactersRef.current = nextCharacters;
    }

    async function loadChatCollection(sourceCharacter = latestCharacterRef.current) {
        try {
            const summaries = normalizeChatSummaryCollection(await loadChatSummaries());
            setChatSummaries(summaries);
            await activateChatForCharacter(sourceCharacter, summaries);
            setChatLoadError("");
            return summaries;
        } catch (error) {
            setChatLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function activateChatForCharacter(
        sourceCharacter: SmileyCharacter,
        sourceSummaries = latestChatSummariesRef.current,
    ) {
        const summaries =
            sourceSummaries === latestChatSummariesRef.current
                ? normalizeChatSummaryCollection(await loadChatSummaries())
                : sourceSummaries;

        setChatSummaries(summaries);

        const characterChats = summaries.chats.filter(
            (chat) => chat.characterId === sourceCharacter.id && !isGroupChat(chat),
        );
        const mappedActiveChatId = summaries.activeChatIdsByCharacter[sourceCharacter.id];
        const activeChatId = characterChats.some((chat) => chat.id === mappedActiveChatId)
            ? mappedActiveChatId
            : characterChats[0]?.id;

        if (!activeChatId) {
            setActiveChat(undefined);
            setGroupCharacters([]);
            setMode(defaultNewChatMode);
            setChatLoadError("");
            return undefined;
        }

        const loadedChat = normalizeChat(await loadChat(activeChatId));

        if (!loadedChat) {
            const fallbackChatId = characterChats.find(
                (chat) => chat.id !== activeChatId,
            )?.id;
            const fallbackChat = fallbackChatId
                ? normalizeChat(await loadChat(fallbackChatId))
                : undefined;

            if (!fallbackChat) {
                setActiveChat(undefined);
                setGroupCharacters([]);
                setMode(defaultNewChatMode);
                setChatLoadError("");
                return undefined;
            }

            setActiveChat(fallbackChat);
            await activateGroupCharactersForChat(fallbackChat);
            setMode(fallbackChat.mode);
            setChatLoadError("");
            return fallbackChat;
        }

        setActiveChat(loadedChat);
        await activateGroupCharactersForChat(loadedChat);
        setMode(loadedChat.mode);
        setChatLoadError("");
        return loadedChat;
    }

    async function activateGroupCharactersForChat(chat: ChatSession | undefined) {
        if (!chat || !isGroupChat(chat)) {
            setGroupCharacters([]);
            return [];
        }

        const characters = await fetchGroupCharacters(chat);
        setGroupCharacters(characters);
        syncGroupMemberMetadata(chat, characters);

        if (characters[0]) {
            onDisplayCharacterChange(characters[0]);
        }

        return characters;
    }

    async function fetchGroupCharacters(chat: ChatSession) {
        const members = chat.members ?? [];
        const characters = await Promise.all(
            members.map((member) => fetchCharacterById(member.characterId)),
        );

        return characters.filter((item) =>
            members.some((member) => member.characterId === item.id),
        );
    }

    function syncGroupMemberMetadata(
        chat: ChatSession,
        sourceCharacters: SmileyCharacter[],
    ) {
        if (!isGroupChat(chat) || !chat.members?.length) {
            return;
        }

        const characterById = new Map(
            sourceCharacters.map((sourceCharacter) => [
                sourceCharacter.id,
                sourceCharacter,
            ]),
        );
        let changed = false;
        const members = chat.members.map((member) => {
            const sourceCharacter = characterById.get(member.characterId);

            if (!sourceCharacter) {
                return member;
            }

            const nextName = sourceCharacter.data.name || "Character";
            const nextAvatarPath = sourceCharacter.avatar?.path;
            const nextMember = {
                ...member,
                name: nextName,
                ...(nextAvatarPath ? { avatarPath: nextAvatarPath } : {}),
            };

            if (!nextAvatarPath) {
                delete nextMember.avatarPath;
            }

            changed =
                changed ||
                member.name !== nextMember.name ||
                member.avatarPath !== nextMember.avatarPath;

            return nextMember;
        });

        if (!changed) {
            return;
        }

        queueChatSave({
            ...chat,
            members,
            defaultTitle: chat.title ? chat.defaultTitle : defaultGroupTitle(members),
            updatedAt: new Date().toISOString(),
        });
    }

    async function createChatForCharacter(
        sourceCharacter: SmileyCharacter,
        chatMode: ChatMode,
    ) {
        const chat = createChatSession({
            character: sourceCharacter,
            messages: [createGreetingMessage(sourceCharacter, chatMode)],
            mode: chatMode,
        });

        try {
            const result = (await createChatRequest(chat)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const createdChat = normalizeChat(result.chat) ?? chat;

            setActiveChat(createdChat);
            await activateGroupCharactersForChat(createdChat);
            setMode(createdChat.mode);

            if (result.chats) {
                setChatSummaries(result.chats);
            } else {
                updateChatSummary(chatToSummary(createdChat));
            }

            setChatLoadError("");
            return createdChat;
        } catch (error) {
            setChatLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function createGroupChat(
        characterIds: string[],
        title?: string,
        greetingMode: GroupGreetingMode = "all",
    ) {
        const uniqueIds = Array.from(new Set(characterIds)).filter(Boolean);

        if (uniqueIds.length === 0) {
            setChatLoadError(
                "Choose at least one character before creating a group chat.",
            );
            return;
        }

        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const selectedCharacters = await Promise.all(
                uniqueIds.map((characterId) => fetchCharacterById(characterId)),
            );
            const safeCharacters = selectedCharacters.filter((item) =>
                latestCharacterSummariesRef.current.characters.some(
                    (summary) => summary.id === item.id,
                ),
            );

            if (safeCharacters.length === 0) {
                throw new Error("Choose at least one saved character.");
            }

            const chat = createGroupChatSession({
                characters: safeCharacters,
                greetingMode,
                messages: createGroupGreetingMessages(
                    safeCharacters,
                    defaultNewChatMode,
                    greetingMode,
                ),
                mode: defaultNewChatMode,
                title,
            });
            const result = (await createChatRequest(chat)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const createdChat = normalizeChat(result.chat) ?? chat;

            setActiveChat(createdChat);
            setGroupCharacters(safeCharacters);
            onDisplayCharacterChange(safeCharacters[0]);
            setMode(createdChat.mode);

            if (result.chats) {
                setChatSummaries(result.chats);
            } else {
                updateChatSummary(chatToSummary(createdChat));
            }

            setChatLoadError("");
            return createdChat;
        } catch (error) {
            setChatLoadError(messageFromError(error));
            return undefined;
        }
    }

    function createGreetingMessage(sourceCharacter: SmileyCharacter, chatMode: ChatMode) {
        return createCharacterGreetingMessage(sourceCharacter, (content) =>
            resolvePresetMacros(content, {
                character: sourceCharacter,
                messages: [],
                mode: chatMode,
                personaDescription: latestPersonaRef.current.description,
                personaName: latestPersonaRef.current.name,
                userStatus,
            }),
        );
    }

    function createGroupGreetingMessages(
        sourceCharacters: SmileyCharacter[],
        chatMode: ChatMode,
        greetingMode: GroupGreetingMode,
    ) {
        if (greetingMode === "none") {
            return [];
        }

        const greetingCharacters =
            greetingMode === "first" ? sourceCharacters.slice(0, 1) : sourceCharacters;

        return greetingCharacters.map((sourceCharacter) =>
            createGreetingMessage(sourceCharacter, chatMode),
        );
    }

    function startNewChat() {
        void startNewChatForActiveCharacter();
    }

    async function startNewChatForActiveCharacter() {
        if (
            !latestCharacterSummariesRef.current.characters.some(
                (item) => item.id === latestCharacterRef.current.id,
            )
        ) {
            setChatLoadError("Create or import a character before starting a chat.");
            return;
        }

        await flushPendingChatAutosaveWithoutStateUpdate();
        await createChatForCharacter(latestCharacterRef.current, defaultNewChatMode);
    }

    function queueChatSave(nextChat: ChatSession) {
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        const isActiveChat = safeChat.id === latestChatRef.current?.id;

        if (isActiveChat) {
            setActiveChat(safeChat);
        }
        updateChatSummary(chatToSummary(safeChat));
        setChatLoadError("");
        chatSaveRequestIdRef.current += 1;

        clearPendingChatAutosave();
        chatAutosaveTimerRef.current = window.setTimeout(() => {
            chatAutosaveTimerRef.current = undefined;
            void persistChat(safeChat, false);
        }, 450);
    }

    function clearPendingChatAutosave() {
        if (chatAutosaveTimerRef.current) {
            window.clearTimeout(chatAutosaveTimerRef.current);
            chatAutosaveTimerRef.current = undefined;
        }
    }

    async function flushPendingChatAutosaveWithoutStateUpdate() {
        if (!chatAutosaveTimerRef.current || !latestChatRef.current) {
            return;
        }

        const pendingChat = latestChatRef.current;
        clearPendingChatAutosave();
        await persistChat(pendingChat, false);
    }

    async function persistChat(nextChat: ChatSession, updateState = true) {
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        const requestId = chatSaveRequestIdRef.current + 1;
        chatSaveRequestIdRef.current = requestId;

        if (updateState) {
            setActiveChat(safeChat);
            updateChatSummary(chatToSummary(safeChat));
        }

        try {
            const result = (await saveChat(safeChat)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const savedChat = normalizeChat(result.chat) ?? safeChat;

            if (requestId === chatSaveRequestIdRef.current) {
                if (updateState || savedChat.id === latestChatRef.current?.id) {
                    setActiveChat(savedChat);
                }
                if (result.chats) {
                    setChatSummaries(result.chats);
                } else {
                    updateChatSummary(chatToSummary(savedChat));
                }
                setChatLoadError("");
            }
        } catch (error) {
            if (requestId === chatSaveRequestIdRef.current) {
                setChatLoadError(messageFromError(error));
            }
        }
    }

    function updateChatSummary(summary: ChatSummary) {
        setChatSummariesState((current) => {
            const activeChatIdsByCharacter = isGroupChat(summary)
                ? current.activeChatIdsByCharacter
                : {
                      ...current.activeChatIdsByCharacter,
                      [summary.characterId]: summary.id,
                  };
            const summaries = normalizeChatSummaryCollection({
                ...current,
                activeChatIdsByCharacter,
                chats: current.chats.some((chat) => chat.id === summary.id)
                    ? current.chats.map((chat) =>
                          chat.id === summary.id ? summary : chat,
                      )
                    : [summary, ...current.chats],
            });

            latestChatSummariesRef.current = summaries;
            return summaries;
        });
    }

    async function selectChat(chatId: string) {
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const loadedChat = normalizeChat(await loadChat(chatId));

            if (!loadedChat) {
                throw new Error("Invalid chat.");
            }

            setActiveChat(loadedChat);
            await activateGroupCharactersForChat(loadedChat);
            setMode(loadedChat.mode);

            const nextSummaries = normalizeChatSummaryCollection({
                ...latestChatSummariesRef.current,
                activeChatIdsByCharacter: isGroupChat(loadedChat)
                    ? latestChatSummariesRef.current.activeChatIdsByCharacter
                    : {
                          ...latestChatSummariesRef.current.activeChatIdsByCharacter,
                          [loadedChat.characterId]: loadedChat.id,
                      },
            });

            setChatSummaries(nextSummaries);

            const result = (await saveChatIndex(nextSummaries)) as {
                chats?: ChatSummaryCollection;
            };

            if (result.chats) {
                setChatSummaries(result.chats);
            }

            setChatLoadError("");
            return loadedChat;
        } catch (error) {
            setChatLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function renameChat(chatId: string, title: string) {
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const currentChat =
                latestChatRef.current?.id === chatId
                    ? latestChatRef.current
                    : normalizeChat(await loadChat(chatId));

            if (!currentChat) {
                throw new Error("Chat not found.");
            }

            const nextChat = {
                ...currentChat,
                title: title.trim() || undefined,
                updatedAt: new Date().toISOString(),
            };

            await persistChat(nextChat, currentChat.id === latestChatRef.current?.id);
            setChatLoadError("");
        } catch (error) {
            setChatLoadError(messageFromError(error));
        }
    }

    async function changeGroupAvatar(chatId: string, file: File) {
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const currentChat =
                latestChatRef.current?.id === chatId
                    ? latestChatRef.current
                    : normalizeChat(await loadChat(chatId));

            if (!currentChat || !isGroupChat(currentChat)) {
                throw new Error("Group chat not found.");
            }

            const previousAvatarPath =
                currentChat.group?.avatar?.type === "custom"
                    ? currentChat.group.avatar.path
                    : "";
            const result = await uploadChatAttachments(chatId, [file]);
            const uploadedAttachment = result.attachments[0];
            const avatarPath = uploadedAttachment?.url;

            if (!avatarPath) {
                throw new Error("Group image upload failed.");
            }

            try {
                await persistChat(
                    {
                        ...currentChat,
                        group: {
                            ...currentChat.group,
                            avatar: {
                                type: "custom",
                                path: avatarPath,
                            },
                            replyOrder: currentChat.group?.replyOrder ?? "list",
                            generationMode:
                                currentChat.group?.generationMode ??
                                "swap-character-cards",
                        },
                        updatedAt: new Date().toISOString(),
                    },
                    currentChat.id === latestChatRef.current?.id,
                );
            } catch (error) {
                await deleteChatAttachment(chatId, uploadedAttachment.id);
                throw error;
            }

            const previousAvatarFile = chatAttachmentFileName(previousAvatarPath, chatId);

            if (previousAvatarFile && previousAvatarPath !== avatarPath) {
                await deleteChatAttachment(chatId, previousAvatarFile);
            }

            setChatLoadError("");
        } catch (error) {
            setChatLoadError(messageFromError(error));
        }
    }

    function chatAttachmentFileName(url: string | undefined, chatId: string) {
        if (!url) {
            return "";
        }

        try {
            const parsed = new URL(url, window.location.origin);
            const prefix = `/api/chats/${encodeURIComponent(chatId)}/attachments/`;

            if (!parsed.pathname.startsWith(prefix)) {
                return "";
            }

            return decodeURIComponent(parsed.pathname.slice(prefix.length));
        } catch {
            return "";
        }
    }

    async function deleteChat(chatId: string) {
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const deletedActiveChat = latestChatRef.current?.id === chatId;
            const deletedChatSummary = latestChatSummariesRef.current.chats.find(
                (chat) => chat.id === chatId,
            );
            const deletedCharacterId =
                deletedChatSummary?.characterId ?? activeCharacterId;
            const result = (await deleteChatRequest(chatId)) as {
                chats?: ChatSummaryCollection;
            };
            const summaries = normalizeChatSummaryCollection(result.chats);

            setChatSummaries(summaries);

            if (deletedActiveChat) {
                if (deletedChatSummary && isGroupChat(deletedChatSummary)) {
                    setActiveChat(undefined);
                    setGroupCharacters([]);
                    setMode(defaultNewChatMode);
                    setChatLoadError("");
                    return;
                }

                const nextChatId =
                    summaries.activeChatIdsByCharacter[deletedCharacterId] ??
                    summaries.chats.find(
                        (chat) =>
                            chat.characterId === deletedCharacterId && !isGroupChat(chat),
                    )?.id;

                if (nextChatId) {
                    const nextChat = normalizeChat(await loadChat(nextChatId));

                    if (nextChat) {
                        setActiveChat(nextChat);
                        await activateGroupCharactersForChat(nextChat);
                        setMode(nextChat.mode);
                    }
                } else {
                    setActiveChat(undefined);
                    setGroupCharacters([]);
                    setMode(defaultNewChatMode);
                }
            }

            setChatLoadError("");
        } catch (error) {
            setChatLoadError(messageFromError(error));
        }
    }

    function changeMode(nextMode: ChatMode) {
        setMode(nextMode);

        const currentChat = latestChatRef.current;
        if (!currentChat || currentChat.mode === nextMode) {
            return;
        }

        queueChatSave({
            ...currentChat,
            mode: nextMode,
            updatedAt: new Date().toISOString(),
        });
    }

    async function updateActiveGroupChat(nextChat: ChatSession) {
        queueChatSave(nextChat);

        if (!isGroupChat(nextChat)) {
            return;
        }

        const characters = await fetchGroupCharacters(nextChat);
        setGroupCharacters(characters);

        if (characters[0]) {
            onDisplayCharacterChange(characters[0]);
        }
    }

    function clearChatState() {
        setActiveChat(undefined);
        setGroupCharacters([]);
        setMode(defaultNewChatMode);
    }

    const activeCharacterChats = useMemo(
        () =>
            chatSummaries.chats.filter((chat) =>
                isGroupChat(chat)
                    ? (chat.members ?? []).some(
                          (member) => member.characterId === activeCharacterId,
                      )
                    : chat.characterId === activeCharacterId,
            ),
        [activeCharacterId, chatSummaries.chats],
    );
    const chatCountsByCharacterId = useMemo(
        () =>
            chatSummaries.chats.reduce<Record<string, number>>((counts, chat) => {
                const characterIds = isGroupChat(chat)
                    ? (chat.members ?? []).map((member) => member.characterId)
                    : [chat.characterId];

                for (const characterId of characterIds) {
                    counts[characterId] = (counts[characterId] ?? 0) + 1;
                }

                return counts;
            }, {}),
        [chatSummaries.chats],
    );
    const activeChatTitle = activeChat ? chatDisplayTitle(activeChat) : "Current chat";

    return {
        activateChatForCharacter,
        activateGroupCharactersForChat,
        activeCharacterChats,
        activeChat,
        activeChatTitle,
        changeGroupAvatar,
        changeMode,
        chatCountsByCharacterId,
        chatLoadError,
        chatSummaries,
        clearChatState,
        createChatForCharacter,
        createGroupChat,
        deleteChat,
        flushPendingChatAutosaveWithoutStateUpdate,
        groupCharacters,
        latestChatRef,
        latestChatSummariesRef,
        latestGroupCharactersRef,
        loadChatCollection,
        persistChat,
        queueChatSave,
        renameChat,
        selectChat,
        setActiveChat,
        setChatLoadError,
        setChatSummaries,
        setGroupCharacters,
        startNewChat,
        updateActiveGroupChat,
        updateChatSummary,
    };
}
