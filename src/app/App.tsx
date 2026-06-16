import "./App.css";

import { computed } from "@preact/signals";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { ChatWorkspace } from "#frontend/features/chat/chat-workspace";
import { PluginModalHost } from "#frontend/features/plugins/plugin-surfaces";

import {
    loadAppPreferences,
    loadConnectionSecrets,
    loadConnectionSettings as loadConnectionSettingsRequest,
    loadLorebookSummaries,
    loadPluginManifests,
    loadPresetCollection as loadPresetCollectionRequest,
    localApiFetch,
    localApiErrorEventName,
    saveAppPreferences,
    saveConnectionSecrets,
    saveConnectionSettings,
} from "#frontend/lib/api/client";
import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import { isGroupChat } from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import {
    applyConnectionSecrets,
    defaultConnectionSettings,
    extractConnectionSecrets,
    normalizeConnectionSecrets,
    normalizeConnectionSettings,
    sanitizeConnectionSecrets,
    sanitizeConnectionSettings,
    type ConnectionSettings,
} from "#frontend/lib/connections/config";
import { materializeChatGenerationMessageImages } from "#frontend/lib/connections/images";
import { getAdapterForSettings } from "#frontend/lib/connections/registry";
import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import {
    defaultAppPreferences,
    normalizeAppPreferences,
    type AppPreferences,
} from "#frontend/lib/preferences/types";

import { loadRuntimePlugins } from "#frontend/lib/plugins/runtime";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";

import type { LorebookCollection } from "#frontend/lib/lorebooks/types";
import { defaultPresetCollection } from "#frontend/lib/presets/defaults";
import { normalizePresetCollection } from "#frontend/lib/presets/normalize";
import type { PresetCollection } from "#frontend/lib/presets/types";

import type {
    CharacterSummaryCollection,
    ChatAuthorNote,
    ChatMetadata,
    ChatMode,
    ChatSession,
    GroupGreetingMode,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import { useCharacterChats } from "./hooks/use-character-chats";
import {
    useAppPluginBridge,
    usePluginSnapshotPublisher,
} from "./hooks/use-app-plugin-bridge";
import { useChatSession } from "./hooks/use-chat-session";
import { useEventCallback } from "./hooks/use-event-callback";
import { usePersonaLibrary } from "./hooks/use-persona-library";
import { useResponsiveAppLayout } from "./hooks/use-responsive-app-layout";
import { AppStartupScreen } from "./components/app-startup-screen";
import {
    CharacterPanelHost,
    GroupPanelHost,
    OptionsModalHost,
    ResponsiveBackdrops,
    SidebarHost,
} from "./components/app-hosts";
import {
    closeSettingsSignal,
    desktopCharacterOpen,
    desktopSidebarOpen,
    mobileCharacterOpen,
    mobileSidebarOpen,
    openSettings,
} from "./ui-state";

const CONNECTION_SETTINGS_SAVE_DEBOUNCE_MS = 400;
type StartupStatus = "loading" | "ready" | "error";

export function App() {
    const [mode, setMode] = useState<ChatMode>("chat");
    const {
        characterOpenSignal,
        isCharacterDrawerLayout,
        isMobileLayout,
        setActiveSidebarOpen,
        sidebarOpenSignal,
        toggleCharacter,
        toggleSidebar,
    } = useResponsiveAppLayout();
    const [userStatus, setUserStatus] = useState<UserStatus>("online");
    const [connectionSettings, setConnectionSettings] = useState<ConnectionSettings>(
        defaultConnectionSettings,
    );
    const [presetCollection, setPresetCollection] = useState<PresetCollection>(
        defaultPresetCollection,
    );
    const [lorebookCollection, setLorebookCollection] = useState<LorebookCollection>({
        version: 1,
        activeLorebookId: "",
        lorebooks: [],
    });
    const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
    const [connectionLoadError, setConnectionLoadError] = useState("");
    const [lorebookLoadError, setLorebookLoadError] = useState("");
    const [presetLoadError, setPresetLoadError] = useState("");
    const [preferencesLoadError, setPreferencesLoadError] = useState("");
    const [preferencesSaveStatus, setPreferencesSaveStatus] = useState("");
    const [localApiWarning, setLocalApiWarning] = useState("");
    const [connectionSettingsLoaded, setConnectionSettingsLoaded] = useState(false);
    const [startupStatus, setStartupStatus] = useState<StartupStatus>("loading");
    const [startupLabel, setStartupLabel] = useState("Loading preferences...");
    const [startupError, setStartupError] = useState("");
    const latestConnectionSettingsRef = useRef<ConnectionSettings>(
        defaultConnectionSettings,
    );
    const connectionSettingsLoadedRef = useRef(false);
    const backgroundLoadsStartedRef = useRef(false);
    const queuedConnectionSettingsSaveRef = useRef<ConnectionSettings | undefined>();
    const connectionSettingsSaveInFlightRef = useRef(false);
    const connectionSettingsSaveTimerRef = useRef<number | undefined>();
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
        isChatLoading,
        chatLoadError,
        createCharacter,
        createGroupChat,
        deleteCharacter,
        deleteChat,
        exportCharacter,
        importCharacterFiles,
        importChatFile,
        loadCharacterCollection,
        loadInitialChatState,
        pendingCharacterId,
        prepareCharacterAvatarUpload,
        queueChatSave,
        removeCharacterAvatar,
        renameChat,
        selectCharacter,
        selectChat,
        startNewChat,
        updateActiveGroupChat,
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
        groupCharacters,
        connectionSettings,
        mode,
        onChatChange: queueChatSave,
        lorebookCollection,
        persona,
        preferences,
        presetCollection,
        userStatus,
    });
    const latestChatSessionForPluginsRef = useRef(chatSession);
    const latestChangeModeForWorkspaceRef = useRef(changeMode);
    const latestCreateCharacterForWorkspaceRef = useRef(createCharacter);
    const latestStartNewChatForWorkspaceRef = useRef(startNewChat);
    const latestSelectCharacterForPluginsRef = useRef(selectCharacter);
    const latestGenerateModelForPluginsRef = useRef(generatePluginModelResponse);
    const latestPluginSnapshotRef = useRef<PluginAppSnapshot | undefined>();
    const activePresetForPlugins =
        presetCollection.presets.find(
            (preset) => preset.id === presetCollection.activePresetId,
        ) ?? presetCollection.presets[0];
    const appShellClassName = useMemo(
        () =>
            computed(
                () =>
                    `app-shell ${desktopSidebarOpen.value ? "" : "sidebar-collapsed"} density-${preferences.appearance.messageDensity} font-${preferences.appearance.fontScale}`,
            ),
        [preferences.appearance.fontScale, preferences.appearance.messageDensity],
    );

    latestChatSessionForPluginsRef.current = chatSession;
    latestChangeModeForWorkspaceRef.current = changeMode;
    latestCreateCharacterForWorkspaceRef.current = createCharacter;
    latestStartNewChatForWorkspaceRef.current = startNewChat;
    latestSelectCharacterForPluginsRef.current = selectCharacter;
    latestGenerateModelForPluginsRef.current = generatePluginModelResponse;

    useEffect(() => {
        void initializeStartup();
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
        latestConnectionSettingsRef.current = connectionSettings;
    }, [connectionSettings]);

    useEffect(() => {
        connectionSettingsLoadedRef.current = connectionSettingsLoaded;
    }, [connectionSettingsLoaded]);

    useEffect(() => {
        function flushConnectionSettingsBeforeUnload() {
            if (!connectionSettingsLoadedRef.current) {
                return;
            }

            clearConnectionSettingsSaveTimer();
            persistConnectionSettingsWithKeepAlive(latestConnectionSettingsRef.current);
        }

        window.addEventListener("pagehide", flushConnectionSettingsBeforeUnload);

        return () => {
            window.removeEventListener("pagehide", flushConnectionSettingsBeforeUnload);
        };
    }, []);

    const { characterPresence, pluginComposerState, isLorebooksPluginEnabled } =
        useAppPluginBridge({
            chatSessionRef: latestChatSessionForPluginsRef,
            generateModelResponseRef: latestGenerateModelForPluginsRef,
            loadCharacterCollection,
            loadLorebookCollection,
            loadPersonaCollection,
            loadPreferences,
            loadPresetCollection,
            selectCharacterRef: latestSelectCharacterForPluginsRef,
        });
    const pluginSnapshot: PluginAppSnapshot = useMemo(
        () => ({
            activeChat,
            character,
            characterPresence,
            connectionSettings: sanitizeConnectionSettings(connectionSettings),
            lorebooks: lorebookCollection,
            messages: chatSession.messages,
            mode,
            persona,
            preferences,
            presetCollection,
            userStatus,
        }),
        [
            activeChat,
            character,
            characterPresence,
            chatSession.messages,
            connectionSettings,
            lorebookCollection,
            mode,
            persona,
            preferences,
            presetCollection,
            userStatus,
        ],
    );
    usePluginSnapshotPublisher(pluginSnapshot);
    latestPluginSnapshotRef.current = pluginSnapshot;
    const getPluginSnapshotForActions = useCallback(() => {
        if (!latestPluginSnapshotRef.current) {
            throw new Error("Plugin snapshot is not available yet.");
        }

        return latestPluginSnapshotRef.current;
    }, []);
    const handleCreateCharacterFromEmptyState = useCallback(() => {
        void latestCreateCharacterForWorkspaceRef.current();
    }, []);
    const handleStartNewChatFromEmptyState = useCallback(() => {
        latestStartNewChatForWorkspaceRef.current();
    }, []);
    const handleAbortGeneration = useCallback(() => {
        latestChatSessionForPluginsRef.current.stopGeneration();
    }, []);
    const handleDeleteMessage = useCallback((messageId: string) => {
        latestChatSessionForPluginsRef.current.deleteMessage(messageId);
    }, []);
    const handleEditMessage = useCallback((messageId: string, content: string) => {
        latestChatSessionForPluginsRef.current.editMessage(messageId, content);
    }, []);
    const handleModeChange = useCallback((nextMode: ChatMode) => {
        latestChangeModeForWorkspaceRef.current(nextMode);
    }, []);
    const handleNextSwipe = useCallback((messageId: string) => {
        void latestChatSessionForPluginsRef.current.nextSwipe(messageId);
    }, []);
    const handlePreviousSwipe = useCallback((messageId: string) => {
        latestChatSessionForPluginsRef.current.previousSwipe(messageId);
    }, []);
    const handleSendMessage = useCallback((draft: string, images?: File[]) => {
        return latestChatSessionForPluginsRef.current.sendMessage(draft, images);
    }, []);
    const handleUpdateChatMetadata = useCallback(
        (metadata: ChatMetadata) => {
            if (!activeChat) {
                return;
            }

            queueChatSave({
                ...activeChat,
                metadata: {
                    ...(activeChat.metadata ?? {}),
                    ...metadata,
                },
            });
        },
        [activeChat, queueChatSave],
    );
    const handleToggleCharacter = useMemo(() => {
        if (!characterSummaries.characters.length) {
            return undefined;
        }

        return toggleCharacter;
    }, [characterSummaries.characters.length, toggleCharacter]);
    const hasCharacters = characterSummaries.characters.length > 0;
    const chatEmptyState = useMemo(() => {
        if (!hasCharacters) {
            return {
                title: "No characters yet",
                description:
                    "Create or import a character to start chatting and roleplaying.",
                actionLabel: "Create character",
                onAction: handleCreateCharacterFromEmptyState,
            };
        }

        if (!activeChat) {
            return {
                title: `No chats with ${character.data.name}`,
                description:
                    "Start a new chat when you want this character to have a saved conversation.",
                actionLabel: "Start new chat",
                onAction: handleStartNewChatFromEmptyState,
            };
        }

        return undefined;
    }, [
        activeChat,
        character.data.name,
        handleCreateCharacterFromEmptyState,
        handleStartNewChatFromEmptyState,
        hasCharacters,
    ]);
    const activeChatIsGroup = activeChat ? isGroupChat(activeChat) : false;

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
            setConnectionSettingsLoaded(true);
        } catch (error) {
            setConnectionLoadError(messageFromError(error));
            setConnectionSettingsLoaded(false);
        }
    }

    function closeSettings() {
        if (connectionSettingsLoaded) {
            queueConnectionSettingsSave(connectionSettings, { immediate: true });
        }
        closeSettingsSignal();
    }

    function updateConnectionSettings(nextSettings: ConnectionSettings) {
        setConnectionSettings(nextSettings);

        if (connectionSettingsLoadedRef.current) {
            queueConnectionSettingsSave(nextSettings);
        }
    }

    function queueConnectionSettingsSave(
        settings: ConnectionSettings,
        options: { immediate?: boolean } = {},
    ) {
        queuedConnectionSettingsSaveRef.current = settings;

        if (options.immediate) {
            clearConnectionSettingsSaveTimer();
            void flushQueuedConnectionSettingsSave();
            return;
        }

        if (connectionSettingsSaveInFlightRef.current) {
            return;
        }

        clearConnectionSettingsSaveTimer();
        connectionSettingsSaveTimerRef.current = window.setTimeout(() => {
            connectionSettingsSaveTimerRef.current = undefined;
            void flushQueuedConnectionSettingsSave();
        }, CONNECTION_SETTINGS_SAVE_DEBOUNCE_MS);
    }

    function clearConnectionSettingsSaveTimer() {
        if (connectionSettingsSaveTimerRef.current === undefined) {
            return;
        }

        window.clearTimeout(connectionSettingsSaveTimerRef.current);
        connectionSettingsSaveTimerRef.current = undefined;
    }

    async function flushQueuedConnectionSettingsSave() {
        if (connectionSettingsSaveInFlightRef.current) {
            return;
        }

        connectionSettingsSaveInFlightRef.current = true;

        try {
            while (queuedConnectionSettingsSaveRef.current) {
                const settings = queuedConnectionSettingsSaveRef.current;
                queuedConnectionSettingsSaveRef.current = undefined;
                await persistConnectionSettings(settings);
            }
        } finally {
            connectionSettingsSaveInFlightRef.current = false;
        }
    }

    async function persistConnectionSettings(settings: ConnectionSettings) {
        try {
            await Promise.all([
                saveConnectionSettings(sanitizeConnectionSettings(settings)),
                saveConnectionSecrets(
                    sanitizeConnectionSecrets(extractConnectionSecrets(settings)),
                ),
            ]);
            setConnectionLoadError("");
        } catch (error) {
            setConnectionLoadError(messageFromError(error));
        }
    }

    function persistConnectionSettingsWithKeepAlive(settings: ConnectionSettings) {
        const safeSettings = sanitizeConnectionSettings(settings);
        const secrets = sanitizeConnectionSecrets(extractConnectionSecrets(settings));

        void localApiFetch("/api/connections", {
            body: JSON.stringify(safeSettings),
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            method: "PUT",
        }).catch((error) => {
            console.warn("Could not persist connection settings before unload:", error);
        });
        void localApiFetch("/api/connections/secrets", {
            body: JSON.stringify(secrets),
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            method: "PUT",
        }).catch((error) => {
            console.warn("Could not persist connection secrets before unload:", error);
        });
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

    async function loadLorebookCollection() {
        try {
            setLorebookCollection(await loadLorebookSummaries());
            setLorebookLoadError("");
        } catch (error) {
            setLorebookLoadError(messageFromError(error, "Failed to load LoreBooks."));
        }
    }

    async function loadPreferences({
        applyStartupLayout,
    }: {
        applyStartupLayout: boolean;
    }) {
        try {
            const loadedPreferences = normalizeAppPreferences(await loadAppPreferences());
            setPreferences(loadedPreferences);

            if (applyStartupLayout) {
                setMode(loadedPreferences.chat.defaultMode);
                desktopCharacterOpen.value =
                    loadedPreferences.layout.characterPanelOpenByDefault;
                mobileCharacterOpen.value = false;
                mobileSidebarOpen.value = false;
            }

            setPreferencesLoadError("");
        } catch (error) {
            setPreferencesLoadError(messageFromError(error));
        }
    }

    async function loadStartupPreferences() {
        const loadedPreferences = normalizeAppPreferences(await loadAppPreferences());
        setPreferences(loadedPreferences);
        setMode(loadedPreferences.chat.defaultMode);
        desktopCharacterOpen.value = loadedPreferences.layout.characterPanelOpenByDefault;
        mobileCharacterOpen.value = false;
        mobileSidebarOpen.value = false;
        setPreferencesLoadError("");
        return loadedPreferences;
    }

    async function initializeStartup() {
        setStartupStatus("loading");
        setStartupError("");

        try {
            setStartupLabel("Loading preferences...");
            await loadStartupPreferences();
            setStartupLabel("Loading characters...");
            await loadInitialChatState();
            setStartupLabel("Opening chat...");
            setStartupStatus("ready");
            startBackgroundLoads();
        } catch (error) {
            setStartupError(messageFromError(error, "Failed to load SmileyChat."));
            setStartupStatus("error");
        }
    }

    function startBackgroundLoads() {
        if (backgroundLoadsStartedRef.current) {
            return;
        }

        backgroundLoadsStartedRef.current = true;
        void loadConnectionSettings();
        void loadLorebookCollection();
        void loadPresetCollection();
        void loadPersonaCollection();
        void loadPlugins();
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

    async function generatePluginModelResponse(request: {
        messages: ChatGenerationMessage[];
        onImage?: (url: string) => void;
        onReasoningToken?: (token: string) => void;
        onToken?: (token: string) => void;
        stream?: boolean;
    }) {
        if (!Array.isArray(request.messages) || request.messages.length === 0) {
            throw new Error("Plugin model request must include at least one message.");
        }

        const connection = getAdapterForSettings(connectionSettings);
        const promptMessages = await materializeChatGenerationMessageImages(
            request.messages,
        );

        return connection.generate({
            generation: activePresetForPlugins?.generation,
            messages: [],
            onImage: request.onImage,
            onReasoningToken: request.onReasoningToken,
            onToken: request.onToken,
            promptMessages,
            stream: request.stream,
        });
    }

    function openPersonasSettings() {
        openSettings("personas");
    }

    const uiFontFamily = preferences.appearance.uiFontFamily.trim();
    const chatFontFamily = preferences.appearance.chatFontFamily.trim();
    const handleClearLocalApiWarning = useEventCallback(() => {
        setLocalApiWarning("");
    });
    const handleOpenSettings = useEventCallback(() => {
        openSettings();
    });
    const handleOpenPersonasSettings = useEventCallback(() => {
        openPersonasSettings();
    });
    const handleSidebarCreateCharacter = useEventCallback(() => {
        void createCharacter();
    });
    const handleSidebarImportCharacterFiles = useEventCallback((files: File[]) => {
        void importCharacterFiles(files);
    });
    const handleSidebarImportChatFile = useEventCallback((file: File) => {
        void importChatFile(file);
    });
    const handleSidebarNewChat = useEventCallback(() => {
        startNewChat();
        if (isMobileLayout) {
            setActiveSidebarOpen(false);
        }
    });
    const handleSidebarNewGroupChat = useEventCallback(
        (characterIds: string[], title?: string, greetingMode?: GroupGreetingMode) => {
            void createGroupChat(characterIds, title, greetingMode);
            if (isMobileLayout) {
                setActiveSidebarOpen(false);
            }
        },
    );
    const handleSidebarDeleteCharacter = useEventCallback(
        (characterId: string, options?: { deleteChats?: boolean }) => {
            void deleteCharacter(characterId, options);
        },
    );
    const handleSidebarExportCharacter = useEventCallback(
        (characterId: string, format: "json" | "png") => {
            void exportCharacter(characterId, format);
        },
    );
    const handleSidebarRemoveCharacterAvatar = useEventCallback((characterId: string) => {
        void removeCharacterAvatar(characterId);
    });
    const handleSidebarDeleteChat = useEventCallback((chatId: string) => {
        void deleteChat(chatId);
    });
    const handleSidebarChangeGroupAvatar = useEventCallback(
        (chatId: string, file: File) => {
            void changeGroupAvatar(chatId, file);
        },
    );
    const handleSidebarRenameChat = useEventCallback((chatId: string, title: string) => {
        void renameChat(chatId, title);
    });
    const handleSidebarSelectChat = useEventCallback((chatId: string) => {
        void selectChat(chatId);
        if (isMobileLayout) {
            setActiveSidebarOpen(false);
        }
    });
    const handleSidebarSelectCharacter = useEventCallback((characterId: string) => {
        void selectCharacter(characterId);
        if (isMobileLayout) {
            setActiveSidebarOpen(false);
        }
    });
    const handleSidebarSelectPersona = useEventCallback((personaId: string) => {
        void selectPersona(personaId);
    });
    const handleGroupPanelChange = useEventCallback((nextChat: ChatSession) => {
        void updateActiveGroupChat(nextChat);
    });
    const handleGroupPanelChangeAvatar = useEventCallback(
        (chatId: string, file: File) => {
            void changeGroupAvatar(chatId, file);
        },
    );
    const handleGroupPanelForceReply = useEventCallback((characterId: string) => {
        void chatSession.forceGroupMemberResponse(characterId);
    });
    const handlePanelUpdateAuthorNote = useEventCallback((authorNote: ChatAuthorNote) => {
        handleUpdateChatMetadata({ authorNote });
    });
    const handleCharacterPanelChange = useEventCallback(
        (nextCharacter: SmileyCharacter) => {
            updateActiveCharacter(nextCharacter);
        },
    );
    const handleCharacterPanelBeforeAvatarUpload = useEventCallback(() => {
        return prepareCharacterAvatarUpload();
    });
    const handleCharacterPanelSavedCharacter = useEventCallback(
        (savedCharacter: SmileyCharacter, summaries?: CharacterSummaryCollection) => {
            applySavedCharacter(savedCharacter, summaries);
        },
    );
    const handleOptionsClose = useEventCallback(() => {
        closeSettings();
    });
    const handleOptionsConnectionSettingsChange = useEventCallback(
        (nextSettings: ConnectionSettings) => {
            updateConnectionSettings(nextSettings);
        },
    );
    const handleOptionsCreatePersona = useEventCallback(() => {
        void createPersona();
    });
    const handleOptionsDeletePersona = useEventCallback((personaId: string) => {
        void deletePersona(personaId);
    });
    const handleOptionsPersonaChange = useEventCallback((nextPersona: SmileyPersona) => {
        void updatePersona(nextPersona);
    });
    const handleOptionsPersonaSelect = useEventCallback((personaId: string) => {
        void selectPersonaForEditing(personaId);
    });
    const handleOptionsSetActivePersona = useEventCallback((personaId: string) => {
        void selectPersona(personaId);
    });
    const handleOptionsPreferencesChange = useEventCallback(
        (nextPreferences: AppPreferences) => {
            updatePreferences(nextPreferences);
        },
    );

    if (startupStatus !== "ready") {
        return (
            <AppStartupScreen
                error={startupStatus === "error" ? startupError : undefined}
                label={startupLabel}
                onRetry={initializeStartup}
            />
        );
    }

    return (
        <main
            className={appShellClassName}
            style={{
                "--custom-ui-font-family": uiFontFamily
                    ? `${uiFontFamily}, var(--default-font-family)`
                    : undefined,
                "--custom-chat-font-family": chatFontFamily
                    ? `${chatFontFamily}, var(--default-font-family)`
                    : undefined,
            }}
        >
            <ResponsiveBackdrops
                characterOpenSignal={characterOpenSignal}
                hasCharacters={hasCharacters}
                isCharacterDrawerLayout={isCharacterDrawerLayout}
                isMobileLayout={isMobileLayout}
                sidebarOpenSignal={sidebarOpenSignal}
            />
            {localApiWarning && (
                <div className="app-warning-banner" role="alert">
                    <span>{localApiWarning}</span>
                    <button type="button" onClick={handleClearLocalApiWarning}>
                        Dismiss
                    </button>
                </div>
            )}
            <SidebarHost
                activeChatId={activeChat?.id ?? ""}
                activeCharacterId={character.id}
                chats={activeCharacterChats}
                chatImportStatus={chatImportStatus}
                chatImportStatusFading={chatImportStatusFading}
                chatLoadError={chatLoadError}
                characters={characterSummaries.characters}
                characterImportStatus={characterImportStatus}
                characterLoadError={characterLoadError}
                pendingCharacterId={pendingCharacterId}
                persona={persona}
                personas={personaSummaries.personas}
                pluginSnapshot={pluginSnapshot}
                userStatus={userStatus}
                hasCharacters={hasCharacters}
                isOpenSignal={sidebarOpenSignal}
                onCreateCharacter={handleSidebarCreateCharacter}
                onImportCharacterFiles={handleSidebarImportCharacterFiles}
                onImportChatFile={handleSidebarImportChatFile}
                onNewChat={handleSidebarNewChat}
                onNewGroupChat={handleSidebarNewGroupChat}
                onOpenSettings={handleOpenSettings}
                onOpenPersonasSettings={handleOpenPersonasSettings}
                onOpenChange={setActiveSidebarOpen}
                chatCountsByCharacterId={chatCountsByCharacterId}
                onDeleteCharacter={handleSidebarDeleteCharacter}
                onExportCharacter={handleSidebarExportCharacter}
                onRemoveCharacterAvatar={handleSidebarRemoveCharacterAvatar}
                onDeleteChat={handleSidebarDeleteChat}
                onChangeGroupAvatar={handleSidebarChangeGroupAvatar}
                onRenameChat={handleSidebarRenameChat}
                onSelectChat={handleSidebarSelectChat}
                onSelectCharacter={handleSidebarSelectCharacter}
                onSelectPersona={handleSidebarSelectPersona}
                onStatusChange={setUserStatus}
            />

            <ChatWorkspace
                activeChatId={activeChat?.id ?? ""}
                characterAvatarPath={
                    hasCharacters && !activeChatIsGroup
                        ? (character.avatar?.path ??
                          characterInitialAvatar(character.data.name))
                        : undefined
                }
                characterName={
                    activeChatIsGroup
                        ? activeChatTitle
                        : hasCharacters
                          ? character.data.name
                          : "No character selected"
                }
                chatTitle={hasCharacters ? activeChatTitle : "No active chat"}
                groupAvatarPath={
                    activeChatIsGroup && activeChat?.group?.avatar?.type === "custom"
                        ? activeChat.group.avatar.path
                        : undefined
                }
                groupMembers={activeChatIsGroup ? activeChat?.members : undefined}
                errorMessage={chatSession.chatError}
                isLoading={isChatLoading}
                isSending={chatSession.isSending}
                messages={chatSession.messages}
                mode={mode}
                preferences={preferences}
                pendingSwipeMessageId={chatSession.pendingSwipeMessageId}
                emptyState={chatEmptyState}
                onAbortGeneration={handleAbortGeneration}
                onDeleteMessage={handleDeleteMessage}
                onEditMessage={handleEditMessage}
                onModeChange={handleModeChange}
                onNextSwipe={handleNextSwipe}
                onPreviousSwipe={handlePreviousSwipe}
                onSendMessage={handleSendMessage}
                onToggleSidebar={toggleSidebar}
                onToggleCharacter={handleToggleCharacter}
                pluginComposerState={pluginComposerState}
                getPluginSnapshot={getPluginSnapshotForActions}
                pluginSnapshot={pluginSnapshot}
            />

            {hasCharacters && activeChatIsGroup && activeChat ? (
                <GroupPanelHost
                    authorNote={activeChat.metadata?.authorNote}
                    characters={characterSummaries.characters}
                    chat={activeChat}
                    isOpenSignal={characterOpenSignal}
                    onChange={handleGroupPanelChange}
                    onChangeAvatar={handleGroupPanelChangeAvatar}
                    onForceReply={handleGroupPanelForceReply}
                    onUpdateAuthorNote={handlePanelUpdateAuthorNote}
                />
            ) : hasCharacters ? (
                <CharacterPanelHost
                    authorNote={activeChat?.metadata?.authorNote}
                    character={character}
                    isOpenSignal={characterOpenSignal}
                    pluginSnapshot={pluginSnapshot}
                    onChange={handleCharacterPanelChange}
                    onBeforeAvatarUpload={handleCharacterPanelBeforeAvatarUpload}
                    onSavedCharacter={handleCharacterPanelSavedCharacter}
                    onUpdateAuthorNote={handlePanelUpdateAuthorNote}
                />
            ) : null}

            <OptionsModalHost
                character={character}
                connectionLoadError={connectionLoadError}
                connectionSettings={connectionSettings}
                messages={chatSession.messages}
                mode={mode}
                preferences={preferences}
                preferencesLoadError={preferencesLoadError}
                preferencesSaveStatus={preferencesSaveStatus}
                lorebookCollection={lorebookCollection}
                lorebookLoadError={lorebookLoadError}
                isLorebooksPluginEnabled={isLorebooksPluginEnabled}
                persona={personaEditorPersona}
                personaCollection={personaSummaries}
                personaLoadError={personaLoadError}
                pluginSnapshot={pluginSnapshot}
                onClose={handleOptionsClose}
                onConnectionSettingsChange={handleOptionsConnectionSettingsChange}
                onCreatePersona={handleOptionsCreatePersona}
                onDeletePersona={handleOptionsDeletePersona}
                onLorebookCollectionChange={setLorebookCollection}
                onPersonaChange={handleOptionsPersonaChange}
                onPersonaSelect={handleOptionsPersonaSelect}
                onPersonaSaved={applySavedPersona}
                onSetActivePersona={handleOptionsSetActivePersona}
                onPreferencesChange={handleOptionsPreferencesChange}
                onPresetCollectionChange={setPresetCollection}
                presetCollection={presetCollection}
                presetLoadError={presetLoadError}
                userStatus={userStatus}
            />

            <PluginModalHost snapshot={pluginSnapshot} />
        </main>
    );
}
