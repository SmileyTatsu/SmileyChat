import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ChatGenerationResult } from "#frontend/lib/connections/types";
import { isGroupChat } from "#frontend/lib/chats/normalize";
import {
    getPluginCharacterPresence,
    getPluginComposerState,
    getPluginSnapshot,
    isPluginEnabled,
    setPluginAppActionHandlers,
    setPluginModelHandlers,
    setPluginPresetHandlers,
    setPluginSnapshot,
    subscribeToPluginEvent,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type {
    PluginAppDataChangedEvent,
    PluginAppSnapshot,
    PluginMacroResolveOptions,
    PluginModelContextBudgetRequest,
    PluginModelGenerateRequest,
} from "#frontend/lib/plugins/types";
import { resolvePresetMacros } from "#frontend/lib/presets/macros";

import { openSettings } from "../ui-state";

type ChatSessionActions = {
    editMessage: (messageId: string, content: string) => void;
    injectMessage: (
        role: "character" | "system" | "user",
        content: string,
        options: {
            authorName?: string;
            avatarPath?: string;
            includeInPrompt?: boolean;
            pluginId: string;
            promptRole?: "assistant" | "user" | "system" | "none";
        },
    ) => Promise<void>;
    sendMessage: (draft: string, files?: File[]) => Promise<void>;
};

type MutableRef<T> = {
    current: T;
};

type UseAppPluginBridgeOptions = {
    getModelContextBudgetRef: MutableRef<
        (request?: PluginModelContextBudgetRequest) => number
    >;
    generateModelResponseRef: MutableRef<
        (request: PluginModelGenerateRequest) => Promise<ChatGenerationResult>
    >;
    loadCharacterCollection: () => Promise<void>;
    loadLorebookCollection: () => Promise<void>;
    loadPersonaCollection: () => Promise<void>;
    loadPreferences: (options: { applyStartupLayout: boolean }) => Promise<void>;
    loadPresetCollection: () => Promise<void>;
    selectCharacterRef: MutableRef<(characterId: string) => Promise<void>>;
    chatSessionRef: MutableRef<ChatSessionActions>;
};

export function useAppPluginBridge({
    chatSessionRef,
    getModelContextBudgetRef,
    generateModelResponseRef,
    loadCharacterCollection,
    loadLorebookCollection,
    loadPersonaCollection,
    loadPreferences,
    loadPresetCollection,
    selectCharacterRef,
}: UseAppPluginBridgeOptions) {
    const [pluginRegistryRevision, setPluginRegistryRevision] = useState(0);
    const loadersRef = useRef({
        loadCharacterCollection,
        loadLorebookCollection,
        loadPersonaCollection,
        loadPreferences,
        loadPresetCollection,
    });
    loadersRef.current = {
        loadCharacterCollection,
        loadLorebookCollection,
        loadPersonaCollection,
        loadPreferences,
        loadPresetCollection,
    };

    useEffect(
        () =>
            subscribeToPluginEvent("app:data-changed", (payload) => {
                if (!isPluginAppDataChangedEvent(payload)) {
                    return;
                }

                if (payload.type === "characters") {
                    void loadersRef.current.loadCharacterCollection();
                    return;
                }

                if (payload.type === "lorebooks") {
                    void loadersRef.current.loadLorebookCollection();
                    return;
                }

                if (payload.type === "personas") {
                    void loadersRef.current.loadPersonaCollection();
                    return;
                }

                if (payload.type === "preferences") {
                    void loadersRef.current.loadPreferences({
                        applyStartupLayout: false,
                    });
                    return;
                }

                if (payload.type === "presets") {
                    void loadersRef.current.loadPresetCollection();
                }
            }),
        [],
    );

    useEffect(
        () =>
            subscribeToPluginEvent("app:open-settings", (payload) => {
                if (payload === "lorebooks") {
                    openSettings("lorebooks");
                }
            }),
        [],
    );

    useEffect(
        () =>
            subscribeToPluginRegistry(() =>
                setPluginRegistryRevision((revision) => revision + 1),
            ),
        [],
    );

    useEffect(() => {
        setPluginAppActionHandlers({
            editMessage: async (messageId, content) => {
                chatSessionRef.current.editMessage(messageId, content);
            },
            generateResponse: () => chatSessionRef.current.sendMessage(""),
            injectMessage: (role, content, options) =>
                chatSessionRef.current.injectMessage(role, content, options),
            sendMessage: (content, options) =>
                chatSessionRef.current.sendMessage(
                    content,
                    options?.files ?? options?.images,
                ),
            switchCharacter: (characterId) => selectCharacterRef.current(characterId),
        });

        return () => setPluginAppActionHandlers({});
    }, [chatSessionRef, selectCharacterRef]);

    useEffect(() => {
        setPluginModelHandlers({
            getContextBudget: (request) => getModelContextBudgetRef.current(request),
            generate: (request) => generateModelResponseRef.current(request),
        });

        return () => setPluginModelHandlers({});
    }, [generateModelResponseRef, getModelContextBudgetRef]);

    useEffect(() => {
        setPluginPresetHandlers({
            resolveMacros: resolvePluginMacros,
        });

        return () => setPluginPresetHandlers({});
    }, []);

    const characterPresence = useMemo(
        () => getPluginCharacterPresence(),
        [pluginRegistryRevision],
    );
    const pluginComposerState = useMemo(
        () => getPluginComposerState(),
        [pluginRegistryRevision],
    );
    const isLorebooksPluginEnabled = useMemo(
        () => isPluginEnabled("smiley-lorebooks"),
        [pluginRegistryRevision],
    );

    return {
        characterPresence,
        isLorebooksPluginEnabled,
        pluginComposerState,
    };
}

function resolvePluginMacros(text: string, options: PluginMacroResolveOptions = {}) {
    const snapshot = getPluginSnapshot();

    if (!snapshot) {
        throw new Error("Plugin macro resolution requires an active app snapshot.");
    }

    const activeChat = snapshot.activeChat;
    const group =
        options.group ??
        (activeChat && isGroupChat(activeChat)
            ? {
                  joinPrefix: activeChat.group?.joinPrefix,
                  memberIds: (activeChat.members ?? []).map(
                      (member) => member.characterId,
                  ),
              }
            : undefined);

    return resolvePresetMacros(text, {
        character: options.character ?? snapshot.character,
        generation: options.generation,
        group,
        messages: options.messages ?? snapshot.messages,
        metadata: options.metadata,
        mode: options.mode ?? snapshot.mode,
        outlets: options.outlets,
        personaDescription: options.personaDescription ?? snapshot.persona.description,
        personaName: options.personaName ?? snapshot.persona.name,
        userStatus: options.userStatus ?? snapshot.userStatus,
    });
}

export function usePluginSnapshotPublisher(pluginSnapshot: PluginAppSnapshot) {
    useLayoutEffect(() => {
        setPluginSnapshot(pluginSnapshot);
    }, [pluginSnapshot]);
}

function isPluginAppDataChangedEvent(
    payload: unknown,
): payload is PluginAppDataChangedEvent {
    if (!payload || typeof payload !== "object") {
        return false;
    }

    const type = (payload as { type?: unknown }).type;
    return (
        type === "characters" ||
        type === "lorebooks" ||
        type === "personas" ||
        type === "preferences" ||
        type === "presets"
    );
}
