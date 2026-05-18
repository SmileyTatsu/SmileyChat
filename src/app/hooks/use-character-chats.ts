import { useEffect, useRef, useState } from "preact/hooks";

import {
    createCharacter as createCharacterRequest,
    createChat as createChatRequest,
    deleteCharacter as deleteCharacterRequest,
    deleteChat as deleteChatRequest,
    exportCharacterCard,
    importChatFile as importChatFileRequest,
    importCharacterFiles as importCharacterFilesRequest,
    loadCharacter,
    loadCharacterSummaries,
    loadChat,
    loadChatSummaries,
    saveCharacter,
    saveCharacterIndex,
    saveChat,
    saveChatIndex,
    uploadChatAttachments,
} from "#frontend/lib/api/client";
import { defaultCharacter } from "#frontend/lib/characters/defaults";
import {
    characterToSummary,
    createBlankCharacter,
    normalizeCharacter,
    normalizeCharacterSummaryCollection,
} from "#frontend/lib/characters/normalize";
import {
    createChatSession,
    createGroupChatSession,
} from "#frontend/lib/chats/defaults";
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

type UseCharacterChatsOptions = {
    defaultNewChatMode: ChatMode;
    latestPersonaRef: { current: SmileyPersona };
    setMode: (mode: ChatMode) => void;
    userStatus: UserStatus;
};

export function useCharacterChats({
    defaultNewChatMode,
    latestPersonaRef,
    setMode,
    userStatus,
}: UseCharacterChatsOptions) {
    const [characterSummaries, setCharacterSummaries] =
        useState<CharacterSummaryCollection>({
            version: 1,
            activeCharacterId: "",
            characters: [],
        });
    const [chatSummaries, setChatSummaries] = useState<ChatSummaryCollection>({
        version: 1,
        activeChatIdsByCharacter: {},
        chats: [],
    });
    const [character, setCharacter] = useState<SmileyCharacter>(defaultCharacter);
    const [groupCharacters, setGroupCharacters] = useState<SmileyCharacter[]>([]);
    const [activeChat, setActiveChat] = useState<ChatSession | undefined>();
    const [characterLoadError, setCharacterLoadError] = useState("");
    const [chatLoadError, setChatLoadError] = useState("");
    const [characterImportStatus, setCharacterImportStatus] = useState("");
    const [chatImportStatus, setChatImportStatus] = useState("");
    const [chatImportStatusFading, setChatImportStatusFading] = useState(false);
    const latestCharacterRef = useRef(character);
    const latestGroupCharactersRef = useRef(groupCharacters);
    const latestCharacterSummariesRef = useRef(characterSummaries);
    const latestChatRef = useRef(activeChat);
    const latestChatSummariesRef = useRef(chatSummaries);
    const characterAutosaveTimerRef = useRef<number | undefined>(undefined);
    const chatAutosaveTimerRef = useRef<number | undefined>(undefined);
    const chatImportStatusTimerRef = useRef<number | undefined>(undefined);
    const chatImportStatusFadeTimerRef = useRef<number | undefined>(undefined);
    const characterSaveRequestIdRef = useRef(0);
    const chatSaveRequestIdRef = useRef(0);

    latestCharacterRef.current = character;
    latestGroupCharactersRef.current = groupCharacters;
    latestCharacterSummariesRef.current = characterSummaries;
    latestChatRef.current = activeChat;
    latestChatSummariesRef.current = chatSummaries;

    useEffect(
        () => () => {
            if (characterAutosaveTimerRef.current) {
                window.clearTimeout(characterAutosaveTimerRef.current);
            }
            if (chatAutosaveTimerRef.current) {
                window.clearTimeout(chatAutosaveTimerRef.current);
            }
            if (chatImportStatusTimerRef.current) {
                window.clearTimeout(chatImportStatusTimerRef.current);
            }
            if (chatImportStatusFadeTimerRef.current) {
                window.clearTimeout(chatImportStatusFadeTimerRef.current);
            }
        },
        [],
    );

    function setChatImportStatusMessage(
        message: string,
        options: { autoDismiss?: boolean } = {},
    ) {
        const { autoDismiss = true } = options;

        if (chatImportStatusTimerRef.current) {
            window.clearTimeout(chatImportStatusTimerRef.current);
            chatImportStatusTimerRef.current = undefined;
        }
        if (chatImportStatusFadeTimerRef.current) {
            window.clearTimeout(chatImportStatusFadeTimerRef.current);
            chatImportStatusFadeTimerRef.current = undefined;
        }

        setChatImportStatus(message);
        setChatImportStatusFading(false);

        if (autoDismiss && message) {
            chatImportStatusTimerRef.current = window.setTimeout(() => {
                chatImportStatusTimerRef.current = undefined;
                beginChatImportStatusFade();
            }, 3000);
        }
    }

    function beginChatImportStatusFade() {
        if (chatImportStatusFadeTimerRef.current) {
            return;
        }
        if (chatImportStatusTimerRef.current) {
            window.clearTimeout(chatImportStatusTimerRef.current);
            chatImportStatusTimerRef.current = undefined;
        }

        setChatImportStatusFading(true);
        chatImportStatusFadeTimerRef.current = window.setTimeout(() => {
            setChatImportStatus("");
            setChatImportStatusFading(false);
            chatImportStatusFadeTimerRef.current = undefined;
        }, 350);
    }

    async function loadCharacterCollection() {
        try {
            const summaries = normalizeCharacterSummaryCollection(
                await loadCharacterSummaries(),
            );

            setCharacterSummaries(summaries);
            latestCharacterSummariesRef.current = summaries;

            if (summaries.characters.length === 0) {
                const chatSummaries = normalizeChatSummaryCollection(
                    await loadChatSummaries(),
                );

                setChatSummaries(chatSummaries);
                latestChatSummariesRef.current = chatSummaries;
                setCharacter(defaultCharacter);
                latestCharacterRef.current = defaultCharacter;
                setGroupCharacters([]);
                latestGroupCharactersRef.current = [];
                setActiveChat(undefined);
                latestChatRef.current = undefined;
                setMode(defaultNewChatMode);
                setCharacterLoadError("");
                setChatLoadError("");
                return;
            }

            const activeCharacter = await fetchCharacterById(summaries.activeCharacterId);
            setCharacter(activeCharacter);
            latestCharacterRef.current = activeCharacter;
            await activateChatForCharacter(activeCharacter);
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function fetchCharacterById(characterId: string) {
        return normalizeCharacter(await loadCharacter(characterId)) ?? defaultCharacter;
    }

    async function activateChatForCharacter(nextCharacter: SmileyCharacter) {
        const summaries = normalizeChatSummaryCollection(await loadChatSummaries());
        setChatSummaries(summaries);
        latestChatSummariesRef.current = summaries;

        const characterChats = summaries.chats.filter(
            (chat) => chat.characterId === nextCharacter.id && !isGroupChat(chat),
        );
        const mappedActiveChatId = summaries.activeChatIdsByCharacter[nextCharacter.id];
        const activeChatId =
            characterChats.some((chat) => chat.id === mappedActiveChatId)
                ? mappedActiveChatId
                : characterChats[0]?.id;

        if (!activeChatId) {
            setActiveChat(undefined);
            latestChatRef.current = undefined;
            setGroupCharacters([]);
            latestGroupCharactersRef.current = [];
            setMode(defaultNewChatMode);
            setChatLoadError("");
            return;
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
                latestChatRef.current = undefined;
                setGroupCharacters([]);
                latestGroupCharactersRef.current = [];
                setMode(defaultNewChatMode);
                setChatLoadError("");
                return;
            }

            setActiveChat(fallbackChat);
            latestChatRef.current = fallbackChat;
            await activateGroupCharactersForChat(fallbackChat);
            setMode(fallbackChat.mode);
            setChatLoadError("");
            return;
        }

        setActiveChat(loadedChat);
        latestChatRef.current = loadedChat;
        await activateGroupCharactersForChat(loadedChat);
        setMode(loadedChat.mode);
        setChatLoadError("");
    }

    async function activateGroupCharactersForChat(chat: ChatSession | undefined) {
        if (!chat || !isGroupChat(chat)) {
            setGroupCharacters([]);
            latestGroupCharactersRef.current = [];
            return;
        }

        const characters = await fetchGroupCharacters(chat);
        setGroupCharacters(characters);
        latestGroupCharactersRef.current = characters;
        syncGroupMemberMetadata(chat, characters);

        if (characters[0]) {
            setCharacter(characters[0]);
            latestCharacterRef.current = characters[0];
        }
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
            sourceCharacters.map((sourceCharacter) => [sourceCharacter.id, sourceCharacter]),
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
            latestChatRef.current = createdChat;
            await activateGroupCharactersForChat(createdChat);
            setMode(createdChat.mode);

            if (result.chats) {
                const summaries = normalizeChatSummaryCollection(result.chats);
                setChatSummaries(summaries);
                latestChatSummariesRef.current = summaries;
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
            setChatLoadError("Choose at least one character before creating a group chat.");
            return;
        }

        beginChatImportStatusFade();
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
            latestChatRef.current = createdChat;
            setGroupCharacters(safeCharacters);
            latestGroupCharactersRef.current = safeCharacters;
            setCharacter(safeCharacters[0]);
            latestCharacterRef.current = safeCharacters[0];
            setMode(createdChat.mode);

            if (result.chats) {
                const summaries = normalizeChatSummaryCollection(result.chats);
                setChatSummaries(summaries);
                latestChatSummariesRef.current = summaries;
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

    function queueCharacterSave(nextCharacter: SmileyCharacter) {
        const safeCharacter = normalizeCharacter(nextCharacter) ?? defaultCharacter;
        setCharacter(safeCharacter);
        latestCharacterRef.current = safeCharacter;
        updateCharacterSummary(characterToSummary(safeCharacter));
        setCharacterLoadError("");
        characterSaveRequestIdRef.current += 1;

        clearPendingCharacterAutosave();
        characterAutosaveTimerRef.current = window.setTimeout(() => {
            characterAutosaveTimerRef.current = undefined;
            void persistCharacter(safeCharacter, false);
        }, 700);
    }

    function clearPendingCharacterAutosave() {
        if (characterAutosaveTimerRef.current) {
            window.clearTimeout(characterAutosaveTimerRef.current);
            characterAutosaveTimerRef.current = undefined;
        }
    }

    async function flushPendingCharacterAutosaveWithoutStateUpdate() {
        if (!characterAutosaveTimerRef.current) {
            return;
        }

        const pendingCharacter = latestCharacterRef.current;
        clearPendingCharacterAutosave();
        await persistCharacter(pendingCharacter, false);
    }

    function queueChatSave(nextChat: ChatSession) {
        const safeChat = normalizeChat(nextChat);

        if (!safeChat) {
            return;
        }

        const isActiveChat = safeChat.id === latestChatRef.current?.id;

        if (isActiveChat) {
            setActiveChat(safeChat);
            latestChatRef.current = safeChat;
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
            latestChatRef.current = safeChat;
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
                    latestChatRef.current = savedChat;
                }
                if (result.chats) {
                    const summaries = normalizeChatSummaryCollection(result.chats);
                    setChatSummaries(summaries);
                    latestChatSummariesRef.current = summaries;
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

    async function persistCharacter(nextCharacter: SmileyCharacter, updateState = true) {
        const safeCharacter = normalizeCharacter(nextCharacter) ?? defaultCharacter;
        const requestId = characterSaveRequestIdRef.current + 1;
        characterSaveRequestIdRef.current = requestId;

        if (updateState) {
            setCharacter(safeCharacter);
            latestCharacterRef.current = safeCharacter;
            updateCharacterSummary(characterToSummary(safeCharacter));
        }

        try {
            const result = (await saveCharacter(safeCharacter)) as {
                character: SmileyCharacter;
                characters?: CharacterSummaryCollection;
            };
            const savedCharacter = normalizeCharacter(result.character) ?? safeCharacter;

            if (requestId === characterSaveRequestIdRef.current) {
                setCharacter(savedCharacter);
                latestCharacterRef.current = savedCharacter;
                if (result.characters) {
                    const summaries = normalizeCharacterSummaryCollection(
                        result.characters,
                    );
                    setCharacterSummaries(summaries);
                    latestCharacterSummariesRef.current = summaries;
                } else {
                    updateCharacterSummary(characterToSummary(savedCharacter));
                }
                setCharacterLoadError("");
            }
        } catch (error) {
            if (requestId === characterSaveRequestIdRef.current) {
                setCharacterLoadError(messageFromError(error));
            }
        }
    }

    function updateActiveCharacter(nextCharacter: SmileyCharacter) {
        queueCharacterSave({
            ...nextCharacter,
            updatedAt: new Date().toISOString(),
        });
    }

    async function selectCharacter(characterId: string) {
        beginChatImportStatusFade();
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const [indexResponse, nextCharacter] = await Promise.all([
                saveCharacterIndex({
                    ...latestCharacterSummariesRef.current,
                    activeCharacterId: characterId,
                }),
                fetchCharacterById(characterId),
            ]);
            setCharacter(nextCharacter);
            latestCharacterRef.current = nextCharacter;
            const result = indexResponse as { characters?: CharacterSummaryCollection };
            if (result.characters) {
                const summaries = normalizeCharacterSummaryCollection(result.characters);
                setCharacterSummaries(summaries);
                latestCharacterSummariesRef.current = summaries;
            } else {
                setCharacterSummaries((current) => ({
                    ...current,
                    activeCharacterId: characterId,
                }));
            }
            await activateChatForCharacter(nextCharacter);
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function createCharacter() {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        await flushPendingChatAutosaveWithoutStateUpdate();

        const summaries = latestCharacterSummariesRef.current;
        const nextCharacter = createBlankCharacter(
            `New character ${summaries.characters.length + 1}`,
        );

        try {
            const result = (await createCharacterRequest(nextCharacter)) as {
                character: SmileyCharacter;
                characters?: CharacterSummaryCollection;
            };
            const createdCharacter =
                normalizeCharacter(result.character) ?? nextCharacter;
            const nextSummaries = result.characters
                ? normalizeCharacterSummaryCollection(result.characters)
                : {
                      ...summaries,
                      activeCharacterId: createdCharacter.id,
                      characters: [
                          ...summaries.characters,
                          characterToSummary(createdCharacter),
                      ],
                  };

            setCharacterSummaries(nextSummaries);
            latestCharacterSummariesRef.current = nextSummaries;
            setCharacter(createdCharacter);
            latestCharacterRef.current = createdCharacter;
            await createChatForCharacter(createdCharacter, defaultNewChatMode);
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
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

        beginChatImportStatusFade();
        await flushPendingChatAutosaveWithoutStateUpdate();
        await createChatForCharacter(latestCharacterRef.current, defaultNewChatMode);
    }

    async function importCharacterFiles(files: File[]) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        await flushPendingChatAutosaveWithoutStateUpdate();

        const formData = new FormData();

        for (const file of files) {
            formData.append("files", file, file.name);
        }

        try {
            const result = await importCharacterFilesRequest(formData);

            if (result.characters) {
                const summaries = normalizeCharacterSummaryCollection(result.characters);
                setCharacterSummaries(summaries);
                latestCharacterSummariesRef.current = summaries;
                const activeCharacter = await fetchCharacterById(
                    result.activeCharacterId ?? summaries.activeCharacterId,
                );
                setCharacter(activeCharacter);
                latestCharacterRef.current = activeCharacter;
                await activateChatForCharacter(activeCharacter);
            } else if ((result.imported ?? 0) > 0) {
                await loadCharacterCollection();
            }
            setCharacterImportStatus(formatImportStatus(result));
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function importChatFile(file: File) {
        const targetCharacterId = latestCharacterRef.current.id;

        if (
            !targetCharacterId ||
            !latestCharacterSummariesRef.current.characters.some(
                (item) => item.id === targetCharacterId,
            )
        ) {
            setChatImportStatusMessage("Select a character before importing a chat.");
            return;
        }

        await flushPendingChatAutosaveWithoutStateUpdate();

        const formData = new FormData();
        formData.append("characterId", targetCharacterId);
        formData.append("file", file, file.name);

        setChatImportStatusMessage(`Importing ${file.name}...`, { autoDismiss: false });

        try {
            const result = (await importChatFileRequest(formData)) as {
                chat: ChatSession;
                chats?: ChatSummaryCollection;
            };
            const importedChat = normalizeChat(result.chat);

            if (!importedChat) {
                throw new Error("Imported chat could not be normalized.");
            }

            if (result.chats) {
                const summaries = normalizeChatSummaryCollection(result.chats);
                setChatSummaries(summaries);
                latestChatSummariesRef.current = summaries;
            } else {
                updateChatSummary(chatToSummary(importedChat));
            }

            setActiveChat(importedChat);
            latestChatRef.current = importedChat;
            await activateGroupCharactersForChat(importedChat);
            setMode(importedChat.mode);
            setChatLoadError("");
            setChatImportStatusMessage(
                `Imported ${importedChat.messages.length} message${
                    importedChat.messages.length === 1 ? "" : "s"
                } from ${file.name}.`,
            );
        } catch (error) {
            const message = messageFromError(error);
            setChatImportStatusMessage(`Import failed: ${message}`);
            setChatLoadError(message);
        }
    }

    async function removeCharacterAvatar(characterId: string) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            if (characterId === latestCharacterRef.current.id) {
                const nextCharacter = {
                    ...latestCharacterRef.current,
                    updatedAt: new Date().toISOString(),
                };
                delete nextCharacter.avatar;
                await persistCharacter(nextCharacter, true);
                return;
            }

            const targetCharacter = await fetchCharacterById(characterId);
            const nextCharacter = { ...targetCharacter };
            delete nextCharacter.avatar;

            const result = (await saveCharacter({
                ...nextCharacter,
                updatedAt: new Date().toISOString(),
            })) as {
                characters?: CharacterSummaryCollection;
            };

            if (result.characters) {
                const summaries = normalizeCharacterSummaryCollection(result.characters);
                setCharacterSummaries(summaries);
                latestCharacterSummariesRef.current = summaries;
            } else {
                updateCharacterSummary(characterToSummary(nextCharacter));
            }
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function deleteCharacter(
        characterId: string,
        options: { deleteChats?: boolean } = {},
    ) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const wasActiveCharacter = characterId === latestCharacterRef.current.id;
            const result = (await deleteCharacterRequest(characterId, options)) as {
                characters?: CharacterSummaryCollection;
                chats?: ChatSummaryCollection;
            };
            const summaries = normalizeCharacterSummaryCollection(result.characters);
            const nextChatSummaries = result.chats
                ? normalizeChatSummaryCollection(result.chats)
                : latestChatSummariesRef.current;
            const nextCharacter =
                wasActiveCharacter && summaries.characters.length > 0
                    ? await fetchCharacterById(summaries.activeCharacterId)
                    : wasActiveCharacter
                      ? defaultCharacter
                      : latestCharacterRef.current;

            setCharacterSummaries(summaries);
            latestCharacterSummariesRef.current = summaries;
            setChatSummaries(nextChatSummaries);
            latestChatSummariesRef.current = nextChatSummaries;
            setCharacter(nextCharacter);
            latestCharacterRef.current = nextCharacter;
            setGroupCharacters([]);
            latestGroupCharactersRef.current = [];

            if (wasActiveCharacter && summaries.characters.length > 0) {
                await activateChatForCharacter(nextCharacter);
            } else if (wasActiveCharacter) {
                setActiveChat(undefined);
                latestChatRef.current = undefined;
                setMode(defaultNewChatMode);
            }

            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function exportCharacter(characterId: string, format: "json" | "png") {
        try {
            const response = await exportCharacterCard(characterId, format);
            const blob = await response.blob();
            const disposition = response.headers.get("Content-Disposition") ?? "";
            const filename =
                disposition.match(/filename="([^"]+)"/)?.[1] ?? `character.${format}`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    function updateCharacterSummary(
        summary: CharacterSummaryCollection["characters"][number],
    ) {
        setCharacterSummaries((current) => {
            const summaries = normalizeCharacterSummaryCollection({
                ...current,
                characters: current.characters.some((item) => item.id === summary.id)
                    ? current.characters.map((item) =>
                          item.id === summary.id ? summary : item,
                      )
                    : [...current.characters, summary],
            });

            latestCharacterSummariesRef.current = summaries;
            return summaries;
        });
    }

    function updateChatSummary(summary: ChatSummary) {
        setChatSummaries((current) => {
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
        beginChatImportStatusFade();
        await flushPendingChatAutosaveWithoutStateUpdate();

        try {
            const loadedChat = normalizeChat(await loadChat(chatId));

            if (!loadedChat) {
                throw new Error("Invalid chat.");
            }

            setActiveChat(loadedChat);
            latestChatRef.current = loadedChat;
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
            latestChatSummariesRef.current = nextSummaries;

            const result = (await saveChatIndex(nextSummaries)) as {
                chats?: ChatSummaryCollection;
            };

            if (result.chats) {
                const summaries = normalizeChatSummaryCollection(result.chats);
                setChatSummaries(summaries);
                latestChatSummariesRef.current = summaries;
            }

            setChatLoadError("");
        } catch (error) {
            setChatLoadError(messageFromError(error));
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

            const result = await uploadChatAttachments(chatId, [file]);
            const avatarPath = result.attachments[0]?.url;

            if (!avatarPath) {
                throw new Error("Group image upload failed.");
            }

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
            setChatLoadError("");
        } catch (error) {
            setChatLoadError(messageFromError(error));
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
                deletedChatSummary?.characterId ?? latestCharacterRef.current.id;
            const result = (await deleteChatRequest(chatId)) as {
                chats?: ChatSummaryCollection;
            };
            const summaries = normalizeChatSummaryCollection(result.chats);

            setChatSummaries(summaries);
            latestChatSummariesRef.current = summaries;

            if (deletedActiveChat) {
                if (deletedChatSummary && isGroupChat(deletedChatSummary)) {
                    setActiveChat(undefined);
                    latestChatRef.current = undefined;
                    setGroupCharacters([]);
                    latestGroupCharactersRef.current = [];
                    setMode(defaultNewChatMode);
                    setChatLoadError("");
                    return;
                }

                const nextChatId =
                    summaries.activeChatIdsByCharacter[deletedCharacterId] ??
                    summaries.chats.find(
                        (chat) =>
                            chat.characterId === deletedCharacterId &&
                            !isGroupChat(chat),
                    )?.id;

                if (nextChatId) {
                    const nextChat = normalizeChat(await loadChat(nextChatId));

                    if (nextChat) {
                        setActiveChat(nextChat);
                        latestChatRef.current = nextChat;
                        await activateGroupCharactersForChat(nextChat);
                        setMode(nextChat.mode);
                    }
                } else {
                    setActiveChat(undefined);
                    latestChatRef.current = undefined;
                    setGroupCharacters([]);
                    latestGroupCharactersRef.current = [];
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
        latestGroupCharactersRef.current = characters;

        if (characters[0]) {
            setCharacter(characters[0]);
            latestCharacterRef.current = characters[0];
        }
    }

    async function prepareCharacterAvatarUpload() {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
    }

    function applySavedCharacter(
        savedCharacter: SmileyCharacter,
        summaries?: CharacterSummaryCollection,
    ) {
        const safeCharacter = normalizeCharacter(savedCharacter) ?? defaultCharacter;
        setCharacter(safeCharacter);
        latestCharacterRef.current = safeCharacter;

        if (summaries) {
            const safeSummaries = normalizeCharacterSummaryCollection(summaries);
            setCharacterSummaries(safeSummaries);
            latestCharacterSummariesRef.current = safeSummaries;
        } else {
            updateCharacterSummary(characterToSummary(safeCharacter));
        }

        setCharacterLoadError("");
    }

    const activeCharacterChats = chatSummaries.chats;
    const chatCountsByCharacterId = chatSummaries.chats.reduce<Record<string, number>>(
        (counts, chat) => {
            const characterIds = isGroupChat(chat)
                ? (chat.members ?? []).map((member) => member.characterId)
                : [chat.characterId];

            for (const characterId of characterIds) {
                counts[characterId] = (counts[characterId] ?? 0) + 1;
            }

            return counts;
        },
        {},
    );
    const activeChatTitle = activeChat ? chatDisplayTitle(activeChat) : "Current chat";

    return {
        activeCharacterChats,
        activeChat,
        activeChatTitle,
        chatCountsByCharacterId,
        groupCharacters,
        applySavedCharacter,
        changeGroupAvatar,
        changeMode,
        character,
        characterImportStatus,
        characterLoadError,
        characterSummaries,
        chatImportStatus,
        chatImportStatusFading,
        chatLoadError,
        createCharacter,
        createGroupChat,
        deleteCharacter,
        deleteChat,
        exportCharacter,
        importCharacterFiles,
        importChatFile,
        loadCharacterCollection,
        prepareCharacterAvatarUpload,
        queueChatSave,
        removeCharacterAvatar,
        renameChat,
        selectCharacter,
        selectChat,
        startNewChat,
        updateActiveGroupChat,
        updateActiveCharacter,
    };
}

function formatImportStatus(result: {
    imported?: number;
    skipped?: number;
    failed?: Array<{ fileName: string; error: string }>;
}) {
    const imported = result.imported ?? 0;
    const skipped = result.skipped ?? 0;
    const failed = result.failed ?? [];
    const parts = [
        `${imported} imported`,
        skipped ? `${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : "",
        failed.length ? `${failed.length} failed` : "",
    ].filter(Boolean);
    const firstFailure = failed[0] ? ` ${failed[0].fileName}: ${failed[0].error}` : "";

    return `Import finished: ${parts.join(", ")}.${firstFailure}`;
}
