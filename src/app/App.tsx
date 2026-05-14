import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import { CharacterPanel } from "../features/characters/CharacterPanel";
import { ChatWorkspace } from "../features/chat/ChatWorkspace";
import { OptionsModal } from "../features/settings/OptionsModal";
import { Sidebar } from "../features/sidebar/Sidebar";
import {
    loadConnectionSecrets,
    loadConnectionSettings as loadConnectionSettingsRequest,
    loadAppPreferences,
    loadPluginManifests,
    loadPresetCollection as loadPresetCollectionRequest,
    saveAppPreferences,
} from "../lib/api/client";
import { characterInitialAvatar } from "../lib/characters/avatar";
import {
    applyConnectionSecrets,
    defaultConnectionSettings,
    normalizeConnectionSecrets,
    normalizeConnectionSettings,
    sanitizeConnectionSettings,
    type ConnectionSettings,
} from "../lib/connections/config";
import { messageFromError } from "../lib/common/errors";
import { defaultPresetCollection } from "../lib/presets/defaults";
import { normalizePresetCollection } from "../lib/presets/normalize";
import type { PresetCollection } from "../lib/presets/types";
import {
    defaultAppPreferences,
    normalizeAppPreferences,
    type AppPreferences,
} from "../lib/preferences/types";
import { setPluginSnapshot, subscribeToPluginRegistry } from "../lib/plugins/registry";
import { loadRuntimePlugins } from "../lib/plugins/runtime";
import type { PluginAppSnapshot } from "../lib/plugins/types";
import type { ChatMode, SettingsCategory, UserStatus } from "../types";
import { useCharacterChats } from "./useCharacterChats";
import { useChatSession } from "./useChatSession";
import { usePersonaLibrary } from "./usePersonaLibrary";
import "./App.css";

export function App() {
    const [mode, setMode] = useState<ChatMode>("chat");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [characterOpen, setCharacterOpen] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [activeSettingsCategory, setActiveSettingsCategory] =
        useState<SettingsCategory>("connections");
    const [userStatus, setUserStatus] = useState<UserStatus>("online");
    const [connectionSettings, setConnectionSettings] = useState<ConnectionSettings>(
        defaultConnectionSettings,
    );
    const [presetCollection, setPresetCollection] = useState<PresetCollection>(
        defaultPresetCollection,
    );
    const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
    const [connectionLoadError, setConnectionLoadError] = useState("");
    const [presetLoadError, setPresetLoadError] = useState("");
    const [preferencesLoadError, setPreferencesLoadError] = useState("");
    const [preferencesSaveStatus, setPreferencesSaveStatus] = useState("");
    const [preferencesInitialized, setPreferencesInitialized] = useState(false);
    const [, setPluginRegistryRevision] = useState(0);
    const {
        applySavedPersona,
        createPersona,
        deletePersona,
        latestPersonaRef,
        loadPersonaCollection,
        persona,
        personaEditorPersona,
        personaLoadError,
        personaSummaries,
        selectPersona,
        selectPersonaForEditing,
        updatePersona,
    } = usePersonaLibrary();
    const {
        activeCharacterChats,
        activeChat,
        activeChatTitle,
        chatCountsByCharacterId,
        applySavedCharacter,
        changeMode,
        character,
        characterImportStatus,
        characterLoadError,
        characterSummaries,
        chatLoadError,
        createCharacter,
        deleteCharacter,
        deleteChat,
        exportCharacter,
        importCharacterFiles,
        loadCharacterCollection,
        prepareCharacterAvatarUpload,
        queueChatSave,
        removeCharacterAvatar,
        renameChat,
        selectCharacter,
        selectChat,
        startNewChat,
        updateActiveCharacter,
    } = useCharacterChats({
        defaultNewChatMode: preferences.chat.defaultMode,
        latestPersonaRef,
        setMode,
        userStatus,
    });
    const chatSession = useChatSession({
        chat: activeChat,
        character,
        connectionSettings,
        mode,
        onChatChange: queueChatSave,
        persona,
        preferences,
        presetCollection,
        userStatus,
    });

    useEffect(() => {
        void loadConnectionSettings();
        void loadPresetCollection();
        void loadPreferences();
        void loadPersonaCollection();
        void loadPlugins();
    }, []);

    useEffect(() => {
        if (!preferencesInitialized) {
            return;
        }

        void loadCharacterCollection();
    }, [preferencesInitialized]);

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setPluginRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    const pluginSnapshot: PluginAppSnapshot = useMemo(
        () => ({
            activeChat,
            character,
            connectionSettings: sanitizeConnectionSettings(connectionSettings),
            messages: chatSession.messages,
            mode,
            persona,
            presetCollection,
            userStatus,
        }),
        [
            activeChat,
            character,
            chatSession.messages,
            connectionSettings,
            mode,
            persona,
            presetCollection,
            userStatus,
        ],
    );
    const hasCharacters = characterSummaries.characters.length > 0;
    const chatEmptyState = !hasCharacters
        ? {
              title: "No characters yet",
              description:
                  "Create or import a character to start chatting and roleplaying.",
              actionLabel: "Create character",
              onAction: () => void createCharacter(),
          }
        : !activeChat
          ? {
                title: `No chats with ${character.data.name}`,
                description:
                    "Start a new chat when you want this character to have a saved conversation.",
                actionLabel: "Start new chat",
                onAction: startNewChat,
            }
          : undefined;

    useLayoutEffect(() => {
        setPluginSnapshot(pluginSnapshot);
    }, [pluginSnapshot]);

    async function loadConnectionSettings() {
        try {
            const [settingsResponse, secretsResponse] = await Promise.all([
                loadConnectionSettingsRequest(),
                loadConnectionSecrets(),
            ]);
            const settings = normalizeConnectionSettings(settingsResponse);
            const secrets = normalizeConnectionSecrets(secretsResponse);
            setConnectionSettings(applyConnectionSecrets(settings, secrets));
            setConnectionLoadError("");
        } catch (error) {
            setConnectionLoadError(messageFromError(error));
        }
    }

    async function loadPresetCollection() {
        try {
            setPresetCollection(
                normalizePresetCollection(await loadPresetCollectionRequest()),
            );
            setPresetLoadError("");
        } catch (error) {
            setPresetLoadError(messageFromError(error));
        }
    }

    async function loadPreferences() {
        try {
            const loadedPreferences = normalizeAppPreferences(await loadAppPreferences());
            setPreferences(loadedPreferences);
            setMode(loadedPreferences.chat.defaultMode);
            setCharacterOpen(loadedPreferences.layout.characterPanelOpenByDefault);
            setPreferencesLoadError("");
        } catch (error) {
            setPreferencesLoadError(messageFromError(error));
        } finally {
            setPreferencesInitialized(true);
        }
    }

    function updatePreferences(nextPreferences: AppPreferences) {
        const normalizedPreferences = normalizeAppPreferences(nextPreferences);
        setPreferences(normalizedPreferences);
        setPreferencesSaveStatus("Saving...");
        void saveAppPreferences(normalizedPreferences)
            .then((response) => {
                const savedPreferences = normalizeAppPreferences(response.preferences);
                setPreferences(savedPreferences);
                setPreferencesSaveStatus("Saved.");
            })
            .catch((error) => {
                setPreferencesSaveStatus(messageFromError(error));
            });
    }

    async function loadPlugins() {
        try {
            const response = await loadPluginManifests();
            await loadRuntimePlugins(response.plugins);
        } catch (error) {
            console.warn("Could not load plugins:", error);
        }
    }

    function openPersonasSettings() {
        setActiveSettingsCategory("personas");
        setSettingsOpen(true);
    }

    return (
        <main
            className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"} density-${preferences.appearance.messageDensity} font-${preferences.appearance.fontScale}`}
        >
            <Sidebar
                activeChatId={activeChat?.id ?? ""}
                activeCharacterId={character.id}
                chats={activeCharacterChats}
                chatLoadError={chatLoadError}
                characters={characterSummaries.characters}
                characterImportStatus={characterImportStatus}
                characterLoadError={characterLoadError}
                persona={persona}
                personas={personaSummaries.personas}
                userStatus={userStatus}
                hasCharacters={hasCharacters}
                isOpen={sidebarOpen}
                onCreateCharacter={() => void createCharacter()}
                onImportCharacterFiles={(files) => void importCharacterFiles(files)}
                onNewChat={startNewChat}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenPersonasSettings={openPersonasSettings}
                onOpenChange={setSidebarOpen}
                chatCountsByCharacterId={chatCountsByCharacterId}
                onDeleteCharacter={(characterId, options) =>
                    void deleteCharacter(characterId, options)
                }
                onExportCharacter={(characterId, format) =>
                    void exportCharacter(characterId, format)
                }
                onRemoveCharacterAvatar={(characterId) =>
                    void removeCharacterAvatar(characterId)
                }
                onDeleteChat={(chatId) => void deleteChat(chatId)}
                onRenameChat={(chatId, title) => void renameChat(chatId, title)}
                onSelectChat={(chatId) => void selectChat(chatId)}
                onSelectCharacter={(characterId) => void selectCharacter(characterId)}
                onSelectPersona={(personaId) => void selectPersona(personaId)}
                onStatusChange={setUserStatus}
            />

            <ChatWorkspace
                activeChatId={activeChat?.id ?? ""}
                characterAvatarPath={
                    hasCharacters
                        ? (character.avatar?.path ??
                          characterInitialAvatar(character.data.name))
                        : undefined
                }
                characterName={
                    hasCharacters ? character.data.name : "No character selected"
                }
                chatTitle={hasCharacters ? activeChatTitle : "No active chat"}
                errorMessage={chatSession.chatError}
                isSending={chatSession.isSending}
                messages={chatSession.messages}
                mode={mode}
                preferences={preferences}
                pendingSwipeMessageId={chatSession.pendingSwipeMessageId}
                emptyState={chatEmptyState}
                onDeleteMessage={chatSession.deleteMessage}
                onEditMessage={chatSession.editMessage}
                onModeChange={changeMode}
                onNextSwipe={(messageId) => void chatSession.nextSwipe(messageId)}
                onPreviousSwipe={chatSession.previousSwipe}
                onSendMessage={chatSession.sendMessage}
                pluginSnapshot={pluginSnapshot}
            />

            {hasCharacters && (
                <CharacterPanel
                    character={character}
                    isOpen={characterOpen}
                    onChange={updateActiveCharacter}
                    onBeforeAvatarUpload={prepareCharacterAvatarUpload}
                    onSavedCharacter={applySavedCharacter}
                    onOpenChange={setCharacterOpen}
                />
            )}

            {settingsOpen && (
                <OptionsModal
                    activeCategory={activeSettingsCategory}
                    character={character}
                    connectionLoadError={connectionLoadError}
                    connectionSettings={connectionSettings}
                    messages={chatSession.messages}
                    mode={mode}
                    preferences={preferences}
                    preferencesLoadError={preferencesLoadError}
                    preferencesSaveStatus={preferencesSaveStatus}
                    persona={personaEditorPersona}
                    personaCollection={personaSummaries}
                    personaLoadError={personaLoadError}
                    pluginSnapshot={pluginSnapshot}
                    onCategoryChange={setActiveSettingsCategory}
                    onClose={() => setSettingsOpen(false)}
                    onConnectionSettingsChange={setConnectionSettings}
                    onCreatePersona={() => void createPersona()}
                    onDeletePersona={(personaId) => void deletePersona(personaId)}
                    onPersonaChange={(nextPersona) => void updatePersona(nextPersona)}
                    onPersonaSelect={(personaId) =>
                        void selectPersonaForEditing(personaId)
                    }
                    onPersonaSaved={applySavedPersona}
                    onSetActivePersona={(personaId) => void selectPersona(personaId)}
                    onPreferencesChange={updatePreferences}
                    onPresetCollectionChange={setPresetCollection}
                    presetCollection={presetCollection}
                    presetLoadError={presetLoadError}
                    userStatus={userStatus}
                />
            )}
        </main>
    );
}
