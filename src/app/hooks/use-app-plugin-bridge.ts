import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ChatGenerationResult } from "#frontend/lib/connections/types";
import {
    getPluginCharacterPresence,
    getPluginComposerState,
    isPluginEnabled,
    setPluginAppActionHandlers,
    setPluginModelHandlers,
    setPluginSnapshot,
    subscribeToPluginEvent,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type {
    PluginAppDataChangedEvent,
    PluginAppSnapshot,
    PluginModelGenerateRequest,
} from "#frontend/lib/plugins/types";

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
    sendMessage: (draft: string, images?: File[]) => Promise<void>;
};

type MutableRef<T> = {
    current: T;
};

type UseAppPluginBridgeOptions = {
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
                chatSessionRef.current.sendMessage(content, options?.images),
            switchCharacter: (characterId) => selectCharacterRef.current(characterId),
        });

        return () => setPluginAppActionHandlers({});
    }, [chatSessionRef, selectCharacterRef]);

    useEffect(() => {
        setPluginModelHandlers({
            generate: (request) => generateModelResponseRef.current(request),
        });

        return () => setPluginModelHandlers({});
    }, [generateModelResponseRef]);

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
