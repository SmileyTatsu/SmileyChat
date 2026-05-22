import { chatToSummary } from "#frontend/lib/chats/normalize";
import type {
    ChatMode,
    ChatSession,
    GroupGreetingMode,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import { useCharacterLibrary } from "./use-character-library";
import { useChatLibrary } from "./use-chat-library";
import { useImportExport } from "./use-import-export";

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
    const characterLibrary = useCharacterLibrary();
    const chatLibrary = useChatLibrary({
        activeCharacterId: characterLibrary.character.id,
        defaultNewChatMode,
        fetchCharacterById: characterLibrary.fetchCharacterById,
        latestCharacterRef: characterLibrary.latestCharacterRef,
        latestCharacterSummariesRef: characterLibrary.latestCharacterSummariesRef,
        latestPersonaRef,
        onDisplayCharacterChange: characterLibrary.setCharacter,
        setMode,
        userStatus,
    });
    const importExport = useImportExport({
        activeCharacterId: characterLibrary.character.id,
        canImportChatForActiveCharacter: () =>
            characterLibrary.latestCharacterSummariesRef.current.characters.some(
                (item) => item.id === characterLibrary.latestCharacterRef.current.id,
            ),
        flushPendingCharacterAutosave:
            characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate,
        flushPendingChatAutosave: chatLibrary.flushPendingChatAutosaveWithoutStateUpdate,
        onCharacterError: characterLibrary.setCharacterLoadError,
        onCharacterImportFallback: async () => {
            await loadCharacterCollection();
        },
        onCharactersImported: async (summaries, activeCharacterId) => {
            characterLibrary.setCharacterSummaries(summaries);
            const activeCharacter = await characterLibrary.fetchCharacterById(
                activeCharacterId ?? summaries.activeCharacterId,
            );
            characterLibrary.setCharacter(activeCharacter);
            await chatLibrary.activateChatForCharacter(activeCharacter);
        },
        onChatError: chatLibrary.setChatLoadError,
        onChatImported: async (chat, summaries) => {
            if (summaries) {
                chatLibrary.setChatSummaries(summaries);
            } else {
                chatLibrary.updateChatSummary(chatToSummary(chat));
            }
            chatLibrary.setActiveChat(chat);
            await chatLibrary.activateGroupCharactersForChat(chat);
            setMode(chat.mode);
        },
        onChatSummariesImported: chatLibrary.setChatSummaries,
    });

    async function loadCharacterCollection() {
        const result = await characterLibrary.loadCharacterCollection();

        if (!result) {
            return;
        }

        if (result.summaries.characters.length === 0) {
            await chatLibrary.loadChatCollection(result.character);
            return;
        }

        await chatLibrary.activateChatForCharacter(result.character);
    }

    async function selectCharacter(characterId: string) {
        importExport.beginChatImportStatusFade();
        await characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate();
        await chatLibrary.flushPendingChatAutosaveWithoutStateUpdate();

        const nextCharacter = await characterLibrary.selectCharacter(characterId);

        if (nextCharacter) {
            await chatLibrary.activateChatForCharacter(nextCharacter);
        }
    }

    async function createCharacter() {
        await characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate();
        await chatLibrary.flushPendingChatAutosaveWithoutStateUpdate();

        const createdCharacter = await characterLibrary.createCharacter();

        if (createdCharacter) {
            await chatLibrary.createChatForCharacter(
                createdCharacter,
                defaultNewChatMode,
            );
        }
    }

    function startNewChat() {
        importExport.beginChatImportStatusFade();
        chatLibrary.startNewChat();
    }

    async function createGroupChat(
        characterIds: string[],
        title?: string,
        greetingMode?: GroupGreetingMode,
    ) {
        importExport.beginChatImportStatusFade();
        return chatLibrary.createGroupChat(characterIds, title, greetingMode);
    }

    async function removeCharacterAvatar(characterId: string) {
        await characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate();
        await chatLibrary.flushPendingChatAutosaveWithoutStateUpdate();
        await characterLibrary.removeCharacterAvatar(characterId);
    }

    async function deleteCharacter(
        characterId: string,
        options: { deleteChats?: boolean } = {},
    ) {
        await characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate();
        await chatLibrary.flushPendingChatAutosaveWithoutStateUpdate();

        const result = await characterLibrary.deleteCharacter(characterId, options);

        if (!result) {
            return;
        }

        if (result.chats) {
            chatLibrary.setChatSummaries(result.chats);
        }

        if (result.wasActiveCharacter && result.summaries.characters.length > 0) {
            await chatLibrary.activateChatForCharacter(result.character);
            return;
        }

        if (result.wasActiveCharacter) {
            chatLibrary.clearChatState();
        }
    }

    async function prepareCharacterAvatarUpload() {
        await characterLibrary.flushPendingCharacterAutosaveWithoutStateUpdate();
        await chatLibrary.flushPendingChatAutosaveWithoutStateUpdate();
    }

    async function updateActiveGroupChat(nextChat: ChatSession) {
        await chatLibrary.updateActiveGroupChat(nextChat);
    }

    function changeMode(nextMode: ChatMode) {
        chatLibrary.changeMode(nextMode);
    }

    return {
        activeCharacterChats: chatLibrary.activeCharacterChats,
        activeChat: chatLibrary.activeChat,
        activeChatTitle: chatLibrary.activeChatTitle,
        applySavedCharacter: characterLibrary.applySavedCharacter,
        changeGroupAvatar: chatLibrary.changeGroupAvatar,
        changeMode,
        character: characterLibrary.character,
        characterImportStatus: importExport.characterImportStatus,
        characterLoadError: characterLibrary.characterLoadError,
        characterSummaries: characterLibrary.characterSummaries,
        chatCountsByCharacterId: chatLibrary.chatCountsByCharacterId,
        chatImportStatus: importExport.chatImportStatus,
        chatImportStatusFading: importExport.chatImportStatusFading,
        chatLoadError: chatLibrary.chatLoadError,
        createCharacter,
        createGroupChat,
        deleteCharacter,
        deleteChat: chatLibrary.deleteChat,
        exportCharacter: importExport.exportCharacter,
        groupCharacters: chatLibrary.groupCharacters,
        importCharacterFiles: importExport.importCharacterFiles,
        importChatFile: importExport.importChatFile,
        loadCharacterCollection,
        prepareCharacterAvatarUpload,
        queueChatSave: chatLibrary.queueChatSave,
        removeCharacterAvatar,
        renameChat: chatLibrary.renameChat,
        selectCharacter,
        selectChat: chatLibrary.selectChat,
        startNewChat,
        updateActiveCharacter: characterLibrary.updateActiveCharacter,
        updateActiveGroupChat,
    };
}
