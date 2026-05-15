import "./App.css";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import { CharacterPanel } from "#frontend/features/characters/character-panel";
import { ChatWorkspace } from "#frontend/features/chat/chat-workspace";
import { OptionsModal } from "#frontend/features/settings/options-modal";
import { Sidebar } from "#frontend/features/sidebar/sidebar";

import {
    loadAppPreferences,
    loadConnectionSecrets,
    loadConnectionSettings as loadConnectionSettingsRequest,
    loadPluginManifests,
    loadPresetCollection as loadPresetCollectionRequest,
    localApiErrorEventName,
    saveAppPreferences,
} from "#frontend/lib/api/client";
import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import { messageFromError } from "#frontend/lib/common/errors";
import {
    applyConnectionSecrets,
    defaultConnectionSettings,
    normalizeConnectionSecrets,
    normalizeConnectionSettings,
    sanitizeConnectionSettings,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import {
    defaultAppPreferences,
    normalizeAppPreferences,
    type AppPreferences,
} from "#frontend/lib/preferences/types";

import {
    setPluginSnapshot,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import { loadRuntimePlugins } from "#frontend/lib/plugins/runtime";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";

import { defaultPresetCollection } from "#frontend/lib/presets/defaults";
import { normalizePresetCollection } from "#frontend/lib/presets/normalize";
import type { PresetCollection } from "#frontend/lib/presets/types";

import type { ChatMode, SettingsCategory, UserStatus } from "#frontend/types";

import { useCharacterChats } from "./hooks/use-character-chats";
import { useChatSession } from "./hooks/use-chat-session";
import { usePersonaLibrary } from "./hooks/use-persona-library";

const MOBILE_SIDEBAR_BREAKPOINT = 820;
const CHARACTER_DRAWER_BREAKPOINT = 1120;

export function App() {
    const [mode, setMode] = useState<ChatMode>("chat");
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    const previousViewportWidthRef = useRef(window.innerWidth);
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [desktopCharacterOpen, setDesktopCharacterOpen] = useState(false);
    const [mobileCharacterOpen, setMobileCharacterOpen] = useState(false);
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
    const [localApiWarning, setLocalApiWarning] = useState("");
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
        chatImportStatus,
        chatImportStatusFading,
        chatLoadError,
        createCharacter,
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
    const isMobileLayout = viewportWidth <= MOBILE_SIDEBAR_BREAKPOINT;
    const isCharacterDrawerLayout = viewportWidth <= CHARACTER_DRAWER_BREAKPOINT;
    const sidebarOpen = isMobileLayout ? mobileSidebarOpen : desktopSidebarOpen;
    const characterOpen = isCharacterDrawerLayout
        ? mobileCharacterOpen
        : desktopCharacterOpen;

    useEffect(() => {
        void loadConnectionSettings();
        void loadPresetCollection();
        void loadPreferences();
        void loadPersonaCollection();
        void loadPlugins();
    }, []);

    useEffect(() => {
        function updateViewportWidth() {
            setViewportWidth(window.innerWidth);
        }

        window.addEventListener("resize", updateViewportWidth);

        return () => {
            window.removeEventListener("resize", updateViewportWidth);
        };
    }, []);

    useEffect(() => {
        function handleLocalApiError(event: Event) {
            const detail = (event as CustomEvent<{ message?: unknown }>).detail;

            if (typeof detail?.message === "string" && detail.message.trim()) {
                setLocalApiWarning(detail.message);
            }
        }

        window.addEventListener(localApiErrorEventName, handleLocalApiError);

        return () => {
            window.removeEventListener(localApiErrorEventName, handleLocalApiError);
        };
    }, []);

    useEffect(() => {
        const previousViewportWidth = previousViewportWidthRef.current;

        if (
            previousViewportWidth > MOBILE_SIDEBAR_BREAKPOINT &&
            viewportWidth <= MOBILE_SIDEBAR_BREAKPOINT
        ) {
            setMobileSidebarOpen(false);
        }

        if (
            previousViewportWidth > CHARACTER_DRAWER_BREAKPOINT &&
            viewportWidth <= CHARACTER_DRAWER_BREAKPOINT
        ) {
            setMobileCharacterOpen(false);
        }

        previousViewportWidthRef.current = viewportWidth;
    }, [viewportWidth]);

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

            setDesktopCharacterOpen(loadedPreferences.layout.characterPanelOpenByDefault);
            setMobileCharacterOpen(false);
            setMobileSidebarOpen(false);

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

    function setActiveSidebarOpen(isOpen: boolean) {
        if (isMobileLayout) {
            setMobileSidebarOpen(isOpen);
            return;
        }

        setDesktopSidebarOpen(isOpen);
    }

    function setActiveCharacterOpen(isOpen: boolean) {
        if (isCharacterDrawerLayout) {
            setMobileCharacterOpen(isOpen);
            return;
        }

        setDesktopCharacterOpen(isOpen);
    }

    return (
        <main
            className={`app-shell ${desktopSidebarOpen ? "" : "sidebar-collapsed"} density-${preferences.appearance.messageDensity} font-${preferences.appearance.fontScale}`}
        >
            {isMobileLayout && sidebarOpen && (
                <div
                    className="sidebar-mobile-backdrop open"
                    role="presentation"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}
            {isCharacterDrawerLayout && hasCharacters && characterOpen && (
                <div
                    className="character-mobile-backdrop open"
                    role="presentation"
                    onClick={() => setMobileCharacterOpen(false)}
                />
            )}
            {localApiWarning && (
                <div className="app-warning-banner" role="alert">
                    <span>{localApiWarning}</span>
                    <button type="button" onClick={() => setLocalApiWarning("")}>
                        Dismiss
                    </button>
                </div>
            )}
            <Sidebar
                activeChatId={activeChat?.id ?? ""}
                activeCharacterId={character.id}
                chats={activeCharacterChats}
                chatImportStatus={chatImportStatus}
                chatImportStatusFading={chatImportStatusFading}
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
                onImportChatFile={(file) => void importChatFile(file)}
                onNewChat={() => {
                    startNewChat();
                    if (isMobileLayout) {
                        setMobileSidebarOpen(false);
                    }
                }}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenPersonasSettings={openPersonasSettings}
                onOpenChange={setActiveSidebarOpen}
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
                onSelectChat={(chatId) => {
                    void selectChat(chatId);
                    if (isMobileLayout) {
                        setMobileSidebarOpen(false);
                    }
                }}
                onSelectCharacter={(characterId) => {
                    void selectCharacter(characterId);
                    if (isMobileLayout) {
                        setMobileSidebarOpen(false);
                    }
                }}
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
                onToggleSidebar={() => {
                    if (isMobileLayout) {
                        setMobileSidebarOpen((prev) => !prev);
                        setMobileCharacterOpen(false);
                        return;
                    }

                    setDesktopSidebarOpen((prev) => !prev);

                    if (isCharacterDrawerLayout) {
                        setMobileCharacterOpen(false);
                    } else {
                        setDesktopCharacterOpen(false);
                    }
                }}
                onToggleCharacter={
                    hasCharacters
                        ? () => {
                              if (isCharacterDrawerLayout) {
                                  setMobileCharacterOpen((prev) => !prev);

                                  if (isMobileLayout) {
                                      setMobileSidebarOpen(false);
                                  } else {
                                      setDesktopSidebarOpen(false);
                                  }

                                  return;
                              }

                              setDesktopCharacterOpen((prev) => !prev);
                              setDesktopSidebarOpen(false);
                          }
                        : undefined
                }
                pluginSnapshot={pluginSnapshot}
            />

            {hasCharacters && (
                <CharacterPanel
                    character={character}
                    isOpen={characterOpen}
                    onChange={updateActiveCharacter}
                    onBeforeAvatarUpload={prepareCharacterAvatarUpload}
                    onSavedCharacter={applySavedCharacter}
                    onOpenChange={setActiveCharacterOpen}
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
