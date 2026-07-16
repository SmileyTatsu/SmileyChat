import type { h } from "preact";

import { createId } from "../common/ids";
import type { ConnectionProfile } from "../connections/config";
import type { ConnectionAdapter } from "../connections/types";
import { estimateChatGenerationMessages } from "../prompt/token-estimator";
import { requireDeclaredPluginPermission } from "./permissions";
import type {
    ChatInputMiddleware,
    MessageUpdateMiddleware,
    MessageDisplayMiddleware,
    MessageRenderContext,
    ChatOutputMiddleware,
    ChatOutputMiddlewareRegistration,
    LoadedPlugin,
    PluginCharacterDetailsSection,
    MessageRenderer,
    PluginChatDetailsSection,
    PluginActionsApi,
    PluginAppSnapshot,
    PluginCharacterPresence,
    PluginCharacterPresenceStatus,
    PluginComposerStatePatch,
    PluginComposerAction,
    PluginComposerOption,
    PluginAppDataChangedEvent,
    PluginConnectionProvider,
    PluginEventsApi,
    PluginHeaderAction,
    PluginMacroResolver,
    PluginMacroResolveOptions,
    PluginManifest,
    PluginModelApi,
    PluginModalInstance,
    PluginMessageAction,
    PluginNetworkApi,
    PluginSidebarPanel,
    PluginSettingsPanel,
    PluginStorageApi,
    PromptMiddleware,
    PluginPromptContextMiddleware,
    PluginPromptInjector,
    SmileyPluginApi,
    PluginTool,
} from "./types";

type Listener = () => void;
type SnapshotListener = (snapshot: PluginAppSnapshot) => void;
type Owned<T> = {
    pluginId: string;
    value: T;
};
type OwnedSnapshotListener = {
    pluginId: string;
    listener: SnapshotListener;
};
type OwnedEventListener = {
    pluginId: string;
    listener: (payload: unknown) => void;
};
type StoredOutputMiddleware = ChatOutputMiddlewareRegistration;

const loadedPlugins: LoadedPlugin[] = [];
const settingsPanels: Array<Owned<PluginSettingsPanel>> = [];
const sidebarPanels: Array<Owned<PluginSidebarPanel>> = [];
const chatDetailsSections: Array<Owned<PluginChatDetailsSection>> = [];
const characterDetailsSections: Array<Owned<PluginCharacterDetailsSection>> = [];
const messageRenderers: Array<Owned<MessageRenderer>> = [];
const messageDisplayMiddlewares: Array<Owned<MessageDisplayMiddleware>> = [];
const messageActions: Array<Owned<PluginMessageAction>> = [];
const composerActions: Array<Owned<PluginComposerAction>> = [];
const composerOptions: Array<Owned<PluginComposerOption>> = [];
const headerActions: Array<Owned<PluginHeaderAction>> = [];
const inputMiddlewares: Array<Owned<ChatInputMiddleware>> = [];
const promptContextMiddlewares: Array<Owned<PluginPromptContextMiddleware>> = [];
const promptInjectors: Array<Owned<PluginPromptInjector>> = [];
const promptMiddlewares: Array<Owned<PromptMiddleware>> = [];
const outputMiddlewares: Array<Owned<StoredOutputMiddleware>> = [];
const messageUpdateMiddlewares: Array<Owned<MessageUpdateMiddleware>> = [];
const modalInstances: Array<Owned<PluginModalInstance>> = [];
const macroResolvers = new Map<string, Owned<PluginMacroResolver>>();
const connectionProviders = new Map<string, Owned<PluginConnectionProvider>>();
const pluginTools = new Map<string, Owned<PluginTool>>();
const enabledPlugins = new Map<string, boolean>();
const listeners = new Set<Listener>();
const snapshotListeners = new Set<OwnedSnapshotListener>();
const eventListeners = new Map<string, Set<OwnedEventListener>>();
const pluginDisposers = new Map<string, () => void>();
const characterPresenceOverrides = new Map<string, PluginCharacterPresenceStatus>();
const composerStateOverrides = new Map<string, PluginComposerStatePatch>();

let latestSnapshot: PluginAppSnapshot | undefined;
let appActionHandlers: Partial<PluginAppActionHandlers> = {};
let draftActionHandlers: Partial<Pick<PluginActionsApi, "insertDraft" | "setDraft">> = {};
let modelHandlers: Partial<PluginModelApi> = {};
let presetHandlers: Partial<PluginPresetHandlers> = {};

type PluginAppActionHandlers = Pick<
    PluginActionsApi,
    | "editMessage"
    | "generateResponse"
    | "sendMessage"
    | "switchCharacter"
    | "updateCharacter"
    | "createLorebook"
    | "addLorebookEntry"
    | "updateLorebookEntry"
    | "deleteLorebookEntry"
    | "updateChatMetadata"
> & {
    injectMessage: (
        role: Parameters<PluginActionsApi["injectMessage"]>[0],
        content: string,
        options: Parameters<PluginActionsApi["injectMessage"]>[2] & {
            pluginId: string;
        },
    ) => Promise<void>;
};
type PluginPresetHandlers = {
    resolveMacros: (text: string, options?: PluginMacroResolveOptions) => string;
};

export function subscribeToPluginRegistry(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setPluginSnapshot(snapshot: PluginAppSnapshot) {
    latestSnapshot = snapshot;

    for (const item of snapshotListeners) {
        if (isPluginEnabled(item.pluginId)) {
            callPluginCallback(item.pluginId, "snapshot listener", () =>
                item.listener(snapshot),
            );
        }
    }
}

export function getPluginSnapshot() {
    return latestSnapshot;
}

export function subscribeToPluginEvent(
    eventName: string,
    listener: (payload: unknown) => void,
    pluginId = "app",
) {
    const listenersForEvent = eventListeners.get(eventName) ?? new Set();
    const item = { pluginId, listener };
    listenersForEvent.add(item);
    eventListeners.set(eventName, listenersForEvent);

    return () => listenersForEvent.delete(item);
}

export function emitPluginEvent(eventName: string, payload?: unknown) {
    for (const item of eventListeners.get(eventName) ?? []) {
        if (item.pluginId === "app" || isPluginEnabled(item.pluginId)) {
            callPluginCallback(item.pluginId, `event listener for "${eventName}"`, () =>
                item.listener(payload),
            );
        }
    }
}

export function emitAppDataChanged(type: PluginAppDataChangedEvent["type"]) {
    emitPluginEvent("app:data-changed", { type } satisfies PluginAppDataChangedEvent);
}

export function initializePluginEnabledStates(manifests: PluginManifest[]) {
    for (const manifest of manifests) {
        enabledPlugins.set(manifest.id, manifest.enabled !== false);
    }

    notifyRegistryChanged();
}

export function setPluginEnabledState(pluginId: string, enabled: boolean) {
    enabledPlugins.set(pluginId, enabled);
    notifyRegistryChanged();
}

export function isPluginEnabled(pluginId: string) {
    return enabledPlugins.get(pluginId) !== false;
}

export function recordLoadedPlugin(plugin: LoadedPlugin) {
    const index = loadedPlugins.findIndex(
        (item) => item.manifest.id === plugin.manifest.id,
    );

    if (index >= 0) {
        loadedPlugins[index] = plugin;
    } else {
        loadedPlugins.push(plugin);
    }

    notifyRegistryChanged();
}

export function recordPluginDisposer(
    pluginId: string,
    dispose: (() => void) | undefined,
) {
    if (dispose) {
        pluginDisposers.set(pluginId, dispose);
    } else {
        pluginDisposers.delete(pluginId);
    }
}

export function deactivatePlugin(pluginId: string) {
    const dispose = pluginDisposers.get(pluginId);

    if (dispose) {
        try {
            dispose();
        } catch (error) {
            console.warn(`Plugin ${pluginId} cleanup failed:`, error);
        }
        pluginDisposers.delete(pluginId);
    }

    removeOwnedItems(settingsPanels, pluginId);
    removeOwnedItems(sidebarPanels, pluginId);
    removeOwnedItems(chatDetailsSections, pluginId);
    removeOwnedItems(characterDetailsSections, pluginId);
    removeOwnedItems(messageRenderers, pluginId);
    removeOwnedItems(messageDisplayMiddlewares, pluginId);
    removeOwnedItems(messageActions, pluginId);
    removeOwnedItems(composerActions, pluginId);
    removeOwnedItems(composerOptions, pluginId);
    removeOwnedItems(headerActions, pluginId);
    removeOwnedItems(inputMiddlewares, pluginId);
    removeOwnedItems(promptContextMiddlewares, pluginId);
    removeOwnedItems(promptInjectors, pluginId);
    removeOwnedItems(promptMiddlewares, pluginId);
    removeOwnedItems(outputMiddlewares, pluginId);
    removeOwnedItems(messageUpdateMiddlewares, pluginId);
    for (const item of modalInstances) {
        if (item.pluginId === pluginId && item.value.onClose) {
            callPluginCallback(pluginId, "modal close handler", item.value.onClose);
        }
    }
    removeOwnedItems(modalInstances, pluginId);
    removeOwnedMapValues(macroResolvers, pluginId);
    removeOwnedMapValues(connectionProviders, pluginId);
    removeOwnedMapValues(pluginTools, pluginId);
    characterPresenceOverrides.delete(pluginId);
    composerStateOverrides.delete(pluginId);

    for (const listenersForEvent of eventListeners.values()) {
        for (const item of [...listenersForEvent]) {
            if (item.pluginId === pluginId) {
                listenersForEvent.delete(item);
            }
        }
    }

    for (const item of [...snapshotListeners]) {
        if (item.pluginId === pluginId) {
            snapshotListeners.delete(item);
        }
    }

    for (const element of document.querySelectorAll(
        `[data-plugin-id="${CSS.escape(pluginId)}"]`,
    )) {
        element.remove();
    }

    notifyRegistryChanged();
}

export function getLoadedPlugins() {
    return [...loadedPlugins];
}

export function getPluginDisplayName(pluginId: string) {
    return (
        loadedPlugins.find((plugin) => plugin.manifest.id === pluginId)?.manifest.name ??
        pluginId
    );
}

export function getPluginSettingsPanels() {
    return enabledValues(settingsPanels);
}

export function getPluginSidebarPanels(side?: PluginSidebarPanel["side"]) {
    return enabledValues(sidebarPanels).filter((panel) => !side || panel.side === side);
}

export function getPluginChatDetailsSections() {
    return enabledValues(chatDetailsSections);
}

export function getPluginCharacterDetailsSections() {
    return enabledValues(characterDetailsSections);
}

export function getMessageRenderers() {
    return enabledValues(messageRenderers).sort(
        (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
    );
}

export function getMessageDisplayMiddlewares() {
    return enabledValues(messageDisplayMiddlewares);
}

/**
 * Display middleware runs during Preact rendering, so a plugin failure must
 * never prevent the saved chat message from rendering.
 */
export function applyMessageDisplayMiddlewares(
    content: string,
    context: MessageRenderContext,
) {
    return messageDisplayMiddlewares
        .filter((middleware) => isPluginEnabled(middleware.pluginId))
        .reduce((current, middleware) => {
            try {
                const next = middleware.value(current, { ...context, content: current });

                if (typeof next !== "string") {
                    console.warn(
                        `Plugin ${getPluginDisplayName(middleware.pluginId)} display middleware returned a non-text value.`,
                    );
                    return current;
                }

                return next;
            } catch (error) {
                warnPluginCallbackError(
                    middleware.pluginId,
                    "message display middleware",
                    error,
                );
                return current;
            }
        }, content);
}

export function getPluginMessageActions() {
    return enabledValues(messageActions);
}

export function getPluginComposerActions() {
    return enabledValues(composerActions);
}

export function getPluginComposerOptions() {
    return enabledValues(composerOptions);
}

export function getPluginHeaderActions() {
    return enabledValues(headerActions);
}

export function getPluginModalInstances() {
    return enabledValues(modalInstances);
}

export function closePluginModal(modalId: string) {
    const index = modalInstances.findIndex((item) => item.value.id === modalId);

    if (index >= 0) {
        const [modal] = modalInstances.splice(index, 1);
        if (modal.value.onClose) {
            callPluginCallback(
                modal.pluginId,
                "modal close handler",
                modal.value.onClose,
            );
        }
        notifyRegistryChanged();
    }
}

export function getInputMiddlewares() {
    return enabledValues(inputMiddlewares);
}

export function getPromptMiddlewares() {
    return enabledValues(promptMiddlewares);
}

export function getPromptContextMiddlewares() {
    return enabledValues(promptContextMiddlewares);
}

export function getPromptInjectors() {
    return enabledValues(promptInjectors);
}

export function getOutputMiddlewares() {
    return enabledValues(outputMiddlewares)
        .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
        .map((middleware) => middleware.run);
}

export function getMessageUpdateMiddlewares() {
    return enabledValues(messageUpdateMiddlewares);
}

export function getPluginMacroValue(
    name: string,
    context: Parameters<PluginMacroResolver>[0],
) {
    const resolver = macroResolvers.get(name);

    if (!resolver || !isPluginEnabled(resolver.pluginId)) {
        return undefined;
    }

    try {
        return resolver.value(context, name);
    } catch (error) {
        warnPluginCallbackError(
            resolver.pluginId,
            `macro resolver for "{{${name}}}"`,
            error,
        );
        return undefined;
    }
}

export function getPluginConnectionProvider(providerId: string) {
    const provider = connectionProviders.get(providerId);
    return provider && isPluginEnabled(provider.pluginId) ? provider.value : undefined;
}

export function getPluginConnectionProviderOwnerId(providerId: string) {
    const provider = connectionProviders.get(providerId);
    return provider && isPluginEnabled(provider.pluginId) ? provider.pluginId : undefined;
}

export function getPluginConnectionProviders() {
    return enabledValues([...connectionProviders.values()]);
}

export function getPluginTools(snapshot = latestSnapshot) {
    return enabledValues([...pluginTools.values()]).filter(
        (tool) => !snapshot || !tool.isAvailable || tool.isAvailable(snapshot),
    );
}

export function getPluginTool(name: string, snapshot = latestSnapshot) {
    const tool = pluginTools.get(name);
    return tool &&
        isPluginEnabled(tool.pluginId) &&
        (!snapshot || !tool.value.isAvailable || tool.value.isAvailable(snapshot))
        ? tool.value
        : undefined;
}

export function setPluginAppActionHandlers(handlers: Partial<PluginAppActionHandlers>) {
    appActionHandlers = handlers;
}

export function setPluginDraftActionHandlers(
    handlers: Partial<Pick<PluginActionsApi, "insertDraft" | "setDraft">>,
) {
    draftActionHandlers = handlers;
}

export function setPluginModelHandlers(handlers: Partial<PluginModelApi>) {
    modelHandlers = handlers;
}

export function setPluginPresetHandlers(handlers: Partial<PluginPresetHandlers>) {
    presetHandlers = handlers;
}

export function getPluginCharacterPresence(): PluginCharacterPresence {
    const activeOverrides = [...characterPresenceOverrides.entries()].filter(
        ([pluginId]) => isPluginEnabled(pluginId),
    );

    for (const status of ["offline", "dnd", "away", "online"] as const) {
        const sourcePluginIds = activeOverrides
            .filter(([, value]) => value === status)
            .map(([pluginId]) => pluginId);

        if (sourcePluginIds.length > 0) {
            return { status, sourcePluginIds };
        }
    }

    return { status: "online", sourcePluginIds: [] };
}

export function getPluginComposerState(): PluginComposerStatePatch {
    const activeOverrides = [...composerStateOverrides.entries()].filter(([pluginId]) =>
        isPluginEnabled(pluginId),
    );
    const disabled = activeOverrides.some(([, state]) => state.disabled === true);
    const placeholders = activeOverrides
        .map(([, state]) => state.placeholder)
        .filter((value): value is string => typeof value === "string");
    const placeholder = placeholders[placeholders.length - 1];

    return {
        ...(disabled ? { disabled } : {}),
        ...(placeholder ? { placeholder } : {}),
    };
}

export function createPluginApi(
    manifest: PluginManifest,
    storage: PluginStorageApi,
    preactH: typeof h,
    network: PluginNetworkApi,
): SmileyPluginApi {
    return {
        plugin: manifest,
        state: {
            getSnapshot() {
                requireDeclaredPluginPermission(manifest, "state:read");
                return getPluginSnapshot();
            },
            subscribe(listener) {
                requireDeclaredPluginPermission(manifest, "state:read");
                const item = { pluginId: manifest.id, listener };
                snapshotListeners.add(item);

                const snapshot = latestSnapshot;

                if (snapshot) {
                    callPluginCallback(manifest.id, "snapshot listener", () =>
                        listener(snapshot),
                    );
                }

                return () => snapshotListeners.delete(item);
            },
        },
        actions: pluginActions(manifest),
        model: pluginModel(manifest),
        network: {
            fetch(url, init) {
                requireDeclaredPluginPermission(manifest, "network:fetch");
                return network.fetch(url, init);
            },
        },
        ui: {
            h: preactH,
            registerSettingsPanel(panel) {
                requireDeclaredPluginPermission(manifest, "ui:settings");
                settingsPanels.push({
                    pluginId: manifest.id,
                    value: { ...panel, id: pluginScopedId(manifest.id, panel.id) },
                });
                notifyRegistryChanged();
            },
            registerSidebarPanel(panel) {
                requireDeclaredPluginPermission(manifest, "ui:sidebar");
                const panelId = pluginScopedId(manifest.id, panel.id);
                upsertOwnedItem(sidebarPanels, manifest.id, panelId, {
                    pluginId: manifest.id,
                    value: {
                        ...panel,
                        id: panelId,
                    },
                });
                notifyRegistryChanged();
            },
            registerChatDetailsSection(section) {
                requireDeclaredPluginPermission(manifest, "ui:sidebar");
                const sectionId = pluginScopedId(manifest.id, section.id);
                upsertOwnedItem(chatDetailsSections, manifest.id, sectionId, {
                    pluginId: manifest.id,
                    value: {
                        ...section,
                        id: sectionId,
                    },
                });
                notifyRegistryChanged();
            },
            registerCharacterDetailsSection(section) {
                requireDeclaredPluginPermission(manifest, "ui:character-details");
                const sectionId = pluginScopedId(manifest.id, section.id);
                upsertOwnedItem(characterDetailsSections, manifest.id, sectionId, {
                    pluginId: manifest.id,
                    value: { ...section, id: sectionId },
                });
                notifyRegistryChanged();
            },
            registerMessageRenderer(renderer) {
                requireDeclaredPluginPermission(manifest, "ui:messages");
                const rendererId = pluginScopedId(manifest.id, renderer.id);
                upsertOwnedItem(messageRenderers, manifest.id, rendererId, {
                    pluginId: manifest.id,
                    value: {
                        ...renderer,
                        id: rendererId,
                    },
                });
                notifyRegistryChanged();
            },
            registerMessageDisplayMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:display");
                messageDisplayMiddlewares.push({
                    pluginId: manifest.id,
                    value: middleware,
                });
            },
            registerMessageAction(action) {
                requireDeclaredPluginPermission(manifest, "ui:message-actions");
                messageActions.push({
                    pluginId: manifest.id,
                    value: { ...action, id: pluginScopedId(manifest.id, action.id) },
                });
                notifyRegistryChanged();
            },
            registerComposerAction(action) {
                requireDeclaredPluginPermission(manifest, "ui:composer");
                composerActions.push({
                    pluginId: manifest.id,
                    value: { ...action, id: pluginScopedId(manifest.id, action.id) },
                });
                notifyRegistryChanged();
            },
            registerComposerOption(option) {
                requireDeclaredPluginPermission(manifest, "ui:composer");
                const optionId = pluginScopedId(manifest.id, option.id);
                upsertOwnedItem(composerOptions, manifest.id, optionId, {
                    pluginId: manifest.id,
                    value: {
                        ...option,
                        id: optionId,
                    },
                });
                notifyRegistryChanged();
            },
            registerHeaderAction(action) {
                requireDeclaredPluginPermission(manifest, "ui:header");
                const actionId = pluginScopedId(manifest.id, action.id);
                upsertOwnedItem(headerActions, manifest.id, actionId, {
                    pluginId: manifest.id,
                    value: {
                        ...action,
                        id: actionId,
                    },
                });
                notifyRegistryChanged();
            },
            openModal(modal) {
                requireDeclaredPluginPermission(manifest, "ui:modals");
                const modalId = pluginScopedId(
                    manifest.id,
                    `${modal.id}-${createId("modal")}`,
                );
                modalInstances.push({
                    pluginId: manifest.id,
                    value: {
                        ...modal,
                        id: modalId,
                        pluginId: manifest.id,
                    },
                });
                notifyRegistryChanged();

                return () => closePluginModal(modalId);
            },
            addStyles(cssText) {
                requireDeclaredPluginPermission(manifest, "ui:styles");
                const style = document.createElement("style");
                style.dataset.pluginId = manifest.id;
                style.textContent = cssText;
                document.head.append(style);
            },
            setComposerState(state) {
                requireDeclaredPluginPermission(manifest, "ui:composer-state");
                const nextState = {
                    ...(typeof state.disabled === "boolean"
                        ? { disabled: state.disabled }
                        : {}),
                    ...(typeof state.placeholder === "string"
                        ? { placeholder: state.placeholder }
                        : {}),
                };

                if (Object.keys(nextState).length === 0) {
                    composerStateOverrides.delete(manifest.id);
                } else {
                    composerStateOverrides.set(manifest.id, nextState);
                }
                notifyRegistryChanged();
            },
        },
        chat: {
            registerInputMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:input");
                inputMiddlewares.push({ pluginId: manifest.id, value: middleware });
            },
            registerPromptContextMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:prompt-context");
                promptContextMiddlewares.push({
                    pluginId: manifest.id,
                    value: middleware,
                });
            },
            registerPromptInjector(injector) {
                requireDeclaredPluginPermission(manifest, "chat:prompt-inject");
                promptInjectors.push({ pluginId: manifest.id, value: injector });
            },
            registerPromptMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:prompt");
                promptMiddlewares.push({ pluginId: manifest.id, value: middleware });
            },
            registerOutputMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:output");
                if (typeof middleware === "function") {
                    outputMiddlewares.push({
                        pluginId: manifest.id,
                        value: {
                            id: createId("output-middleware"),
                            run: middleware,
                        },
                    });
                    return;
                }

                const middlewareId = pluginScopedId(manifest.id, middleware.id);
                upsertOwnedItem(outputMiddlewares, manifest.id, middlewareId, {
                    pluginId: manifest.id,
                    value: {
                        ...middleware,
                        id: middlewareId,
                    },
                });
            },
            registerMessageUpdateMiddleware(middleware) {
                requireDeclaredPluginPermission(manifest, "chat:message-update");
                messageUpdateMiddlewares.push({
                    pluginId: manifest.id,
                    value: middleware,
                });
            },
        },
        presets: {
            registerMacro(name, resolver) {
                requireDeclaredPluginPermission(manifest, "presets:macros");
                registerOwnedMapValue(macroResolvers, name.trim(), {
                    pluginId: manifest.id,
                    value: resolver,
                });
            },
            resolveMacros(text, options) {
                requireDeclaredPluginPermission(manifest, "presets:macros");
                const handler = presetHandlers.resolveMacros;

                if (!handler) {
                    throw new Error("Plugin macro resolution API is not available.");
                }

                return handler(text, options);
            },
        },
        connections: {
            registerProvider(provider) {
                requireDeclaredPluginPermission(manifest, "connections:providers");
                const registered = registerOwnedMapValue(
                    connectionProviders,
                    provider.id,
                    {
                        pluginId: manifest.id,
                        value: provider,
                    },
                );
                if (registered) {
                    notifyRegistryChanged();
                }
            },
        },
        tools: {
            registerTool(tool) {
                requireDeclaredPluginPermission(manifest, "tools:register");
                const name = tool.name.trim();

                if (!name) {
                    throw new Error("Plugin tools need a non-empty name.");
                }

                if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
                    throw new Error(
                        `Plugin tool "${name}" must use only letters, numbers, underscores, or hyphens.`,
                    );
                }

                if (!tool.description.trim()) {
                    throw new Error(`Plugin tool "${name}" needs a description.`);
                }

                const registered = registerOwnedMapValue(pluginTools, name, {
                    pluginId: manifest.id,
                    value: {
                        ...tool,
                        name,
                    },
                });

                if (registered) {
                    notifyRegistryChanged();
                }

                return () => {
                    const current = pluginTools.get(name);
                    if (current?.pluginId === manifest.id && current.value === tool) {
                        pluginTools.delete(name);
                        notifyRegistryChanged();
                    }
                };
            },
        },
        storage,
        events: pluginEvents(manifest),
    };
}

export function createAdapterFromPluginProvider(
    providerId: string,
    profile: ConnectionProfile,
): ConnectionAdapter | undefined {
    const provider = getPluginConnectionProvider(providerId);
    return provider?.createAdapter(profile);
}

function pluginModel(manifest: PluginManifest): PluginModelApi {
    return {
        estimateTokens(messages) {
            requireDeclaredPluginPermission(manifest, "model:generate");

            if (!Array.isArray(messages)) {
                throw new Error("Plugin token estimate requires a message array.");
            }

            return estimateChatGenerationMessages(messages);
        },
        async generate(request) {
            requireDeclaredPluginPermission(manifest, "model:generate");
            const handler = modelHandlers.generate;

            if (!handler) {
                throw new Error("Plugin model generate API is not available.");
            }

            return handler(request);
        },
        getContextBudget(request) {
            requireDeclaredPluginPermission(manifest, "model:generate");
            const handler = modelHandlers.getContextBudget;

            if (!handler) {
                throw new Error("Plugin model context budget API is not available.");
            }

            return handler(request);
        },
    };
}

function pluginActions(manifest: PluginManifest): PluginActionsApi {
    return {
        async sendMessage(content, options) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.sendMessage;

            if (!handler) {
                throw new Error("Plugin sendMessage action is not available.");
            }

            await handler(content, options);
        },
        async injectMessage(role, content, options) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.injectMessage;

            if (!handler) {
                throw new Error("Plugin injectMessage action is not available.");
            }

            await handler(role, content, {
                ...options,
                pluginId: manifest.id,
            });
        },
        async editMessage(messageId, content) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.editMessage;

            if (!handler) {
                throw new Error("Plugin editMessage action is not available.");
            }

            await handler(messageId, content);
        },
        async generateResponse() {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.generateResponse;

            if (!handler) {
                throw new Error("Plugin generateResponse action is not available.");
            }

            await handler();
        },
        async switchCharacter(characterId) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.switchCharacter;

            if (!handler) {
                throw new Error("Plugin switchCharacter action is not available.");
            }

            await handler(characterId);
        },
        async updateCharacter(characterId, patch) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.updateCharacter;
            if (!handler)
                throw new Error("Plugin updateCharacter action is not available.");
            await handler(characterId, patch);
        },
        async createLorebook(data) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.createLorebook;
            if (!handler)
                throw new Error("Plugin createLorebook action is not available.");
            return handler(data);
        },
        async addLorebookEntry(lorebookId, entry) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.addLorebookEntry;
            if (!handler)
                throw new Error("Plugin addLorebookEntry action is not available.");
            await handler(lorebookId, entry);
        },
        async updateLorebookEntry(lorebookId, entryId, patch) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.updateLorebookEntry;
            if (!handler)
                throw new Error("Plugin updateLorebookEntry action is not available.");
            await handler(lorebookId, entryId, patch);
        },
        async deleteLorebookEntry(lorebookId, entryId) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.deleteLorebookEntry;
            if (!handler)
                throw new Error("Plugin deleteLorebookEntry action is not available.");
            await handler(lorebookId, entryId);
        },
        async updateChatMetadata(chatId, patch) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = appActionHandlers.updateChatMetadata;
            if (!handler)
                throw new Error("Plugin updateChatMetadata action is not available.");
            await handler(chatId, patch);
        },
        setCharacterPresence(status) {
            requireDeclaredPluginPermission(manifest, "actions");

            if (!["online", "away", "dnd", "offline"].includes(status)) {
                throw new Error(`Unsupported character presence status: ${status}`);
            }

            characterPresenceOverrides.set(manifest.id, status);
            notifyRegistryChanged();
        },
        setDraft(text) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = draftActionHandlers.setDraft;

            if (!handler) {
                throw new Error("Plugin setDraft action is not available.");
            }

            handler(text);
        },
        insertDraft(text) {
            requireDeclaredPluginPermission(manifest, "actions");
            const handler = draftActionHandlers.insertDraft;

            if (!handler) {
                throw new Error("Plugin insertDraft action is not available.");
            }

            handler(text);
        },
    };
}

function pluginEvents(manifest: PluginManifest): PluginEventsApi {
    return {
        on(eventName, listener) {
            requireDeclaredPluginPermission(manifest, "events");
            return subscribeToPluginEvent(eventName, listener, manifest.id);
        },
        emit(eventName, payload) {
            requireDeclaredPluginPermission(manifest, "events");
            emitPluginEvent(eventName, payload);
        },
    };
}

function pluginScopedId(pluginId: string, itemId: string) {
    return itemId.startsWith(`${pluginId}:`) ? itemId : `${pluginId}:${itemId}`;
}

function notifyRegistryChanged() {
    for (const listener of listeners) {
        callRegistryCallback("registry listener", listener);
    }
}

function callPluginCallback(pluginId: string, action: string, callback: () => void) {
    try {
        callback();
    } catch (error) {
        warnPluginCallbackError(pluginId, action, error);
    }
}

function callRegistryCallback(action: string, callback: () => void) {
    try {
        callback();
    } catch (error) {
        console.warn(`Plugin ${action} failed:`, error);
    }
}

function warnPluginCallbackError(pluginId: string, action: string, error: unknown) {
    const displayName = pluginId === "app" ? "app" : getPluginDisplayName(pluginId);
    console.warn(`Plugin ${displayName} ${action} failed:`, error);
}

function enabledValues<T>(items: Array<Owned<T>>) {
    return items
        .filter((item) => isPluginEnabled(item.pluginId))
        .map((item) => item.value);
}

function removeOwnedItems<T>(items: Array<Owned<T>>, pluginId: string) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index].pluginId === pluginId) {
            items.splice(index, 1);
        }
    }
}

function upsertOwnedItem<T extends { id: string }>(
    items: Array<Owned<T>>,
    pluginId: string,
    itemId: string,
    item: Owned<T>,
) {
    const index = items.findIndex(
        (current) => current.pluginId === pluginId && current.value.id === itemId,
    );

    if (index >= 0) {
        items[index] = item;
    } else {
        items.push(item);
    }
}

function removeOwnedMapValues<T>(items: Map<string, Owned<T>>, pluginId: string) {
    for (const [key, item] of items) {
        if (item.pluginId === pluginId) {
            items.delete(key);
        }
    }
}

function registerOwnedMapValue<T>(
    items: Map<string, Owned<T>>,
    key: string,
    item: Owned<T>,
) {
    const current = items.get(key);

    if (current && current.pluginId !== item.pluginId) {
        console.warn(
            `Plugin ${getPluginDisplayName(item.pluginId)} tried to register duplicate plugin key "${key}" already owned by ${getPluginDisplayName(current.pluginId)}.`,
        );
        return false;
    }

    items.set(key, item);
    return true;
}
