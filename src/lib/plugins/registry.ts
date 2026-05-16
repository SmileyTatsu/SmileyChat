import type { h } from "preact";

import type { ConnectionProfile } from "../connections/config";
import type { ConnectionAdapter } from "../connections/types";
import type {
    ChatInputMiddleware,
    ChatOutputMiddleware,
    LoadedPlugin,
    MessageRenderer,
    PluginActionsApi,
    PluginAppSnapshot,
    PluginComposerAction,
    PluginConnectionProvider,
    PluginEventsApi,
    PluginHeaderAction,
    PluginMacroResolver,
    PluginManifest,
    PluginModalInstance,
    PluginMessageAction,
    PluginNetworkApi,
    PluginSidebarPanel,
    PluginSettingsPanel,
    PluginStorageApi,
    PromptMiddleware,
    SmileyPluginApi,
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

const loadedPlugins: LoadedPlugin[] = [];
const settingsPanels: Array<Owned<PluginSettingsPanel>> = [];
const sidebarPanels: Array<Owned<PluginSidebarPanel>> = [];
const messageRenderers: Array<Owned<MessageRenderer>> = [];
const messageActions: Array<Owned<PluginMessageAction>> = [];
const composerActions: Array<Owned<PluginComposerAction>> = [];
const headerActions: Array<Owned<PluginHeaderAction>> = [];
const inputMiddlewares: Array<Owned<ChatInputMiddleware>> = [];
const promptMiddlewares: Array<Owned<PromptMiddleware>> = [];
const outputMiddlewares: Array<Owned<ChatOutputMiddleware>> = [];
const modalInstances: Array<Owned<PluginModalInstance>> = [];
const macroResolvers = new Map<string, Owned<PluginMacroResolver>>();
const connectionProviders = new Map<string, Owned<PluginConnectionProvider>>();
const enabledPlugins = new Map<string, boolean>();
const listeners = new Set<Listener>();
const snapshotListeners = new Set<OwnedSnapshotListener>();
const eventListeners = new Map<string, Set<OwnedEventListener>>();
const pluginDisposers = new Map<string, () => void>();

let latestSnapshot: PluginAppSnapshot | undefined;
let appActionHandlers: Partial<
    Pick<PluginActionsApi, "generateResponse" | "sendMessage" | "switchCharacter">
> = {};
let draftActionHandlers: Partial<Pick<PluginActionsApi, "insertDraft" | "setDraft">> =
    {};

export function subscribeToPluginRegistry(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setPluginSnapshot(snapshot: PluginAppSnapshot) {
    latestSnapshot = snapshot;

    for (const item of snapshotListeners) {
        if (isPluginEnabled(item.pluginId)) {
            item.listener(snapshot);
        }
    }
}

export function getPluginSnapshot() {
    return latestSnapshot;
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
    removeOwnedItems(messageRenderers, pluginId);
    removeOwnedItems(messageActions, pluginId);
    removeOwnedItems(composerActions, pluginId);
    removeOwnedItems(headerActions, pluginId);
    removeOwnedItems(inputMiddlewares, pluginId);
    removeOwnedItems(promptMiddlewares, pluginId);
    removeOwnedItems(outputMiddlewares, pluginId);
    removeOwnedItems(modalInstances, pluginId);
    removeOwnedMapValues(macroResolvers, pluginId);
    removeOwnedMapValues(connectionProviders, pluginId);

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

export function getPluginSettingsPanels() {
    return enabledValues(settingsPanels);
}

export function getPluginSidebarPanels(side?: PluginSidebarPanel["side"]) {
    return enabledValues(sidebarPanels).filter((panel) => !side || panel.side === side);
}

export function getMessageRenderers() {
    return enabledValues(messageRenderers).sort(
        (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
    );
}

export function getPluginMessageActions() {
    return enabledValues(messageActions);
}

export function getPluginComposerActions() {
    return enabledValues(composerActions);
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
        modalInstances.splice(index, 1);
        notifyRegistryChanged();
    }
}

export function getInputMiddlewares() {
    return enabledValues(inputMiddlewares);
}

export function getPromptMiddlewares() {
    return enabledValues(promptMiddlewares);
}

export function getOutputMiddlewares() {
    return enabledValues(outputMiddlewares);
}

export function getPluginMacroValue(
    name: string,
    context: Parameters<PluginMacroResolver>[0],
) {
    const resolver = macroResolvers.get(name);
    return resolver && isPluginEnabled(resolver.pluginId)
        ? resolver.value(context, name)
        : undefined;
}

export function getPluginConnectionProvider(providerId: string) {
    const provider = connectionProviders.get(providerId);
    return provider && isPluginEnabled(provider.pluginId) ? provider.value : undefined;
}

export function getPluginConnectionProviders() {
    return enabledValues([...connectionProviders.values()]);
}

export function setPluginAppActionHandlers(
    handlers: Partial<
        Pick<PluginActionsApi, "generateResponse" | "sendMessage" | "switchCharacter">
    >,
) {
    appActionHandlers = handlers;
}

export function setPluginDraftActionHandlers(
    handlers: Partial<Pick<PluginActionsApi, "insertDraft" | "setDraft">>,
) {
    draftActionHandlers = handlers;
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
                requirePluginPermission(manifest, "state:read");
                return getPluginSnapshot();
            },
            subscribe(listener) {
                requirePluginPermission(manifest, "state:read");
                const item = { pluginId: manifest.id, listener };
                snapshotListeners.add(item);

                if (latestSnapshot) {
                    listener(latestSnapshot);
                }

                return () => snapshotListeners.delete(item);
            },
        },
        actions: pluginActions(manifest),
        network: {
            fetch(url, init) {
                requirePluginPermission(manifest, "network:fetch");
                return network.fetch(url, init);
            },
        },
        ui: {
            h: preactH,
            registerSettingsPanel(panel) {
                requirePluginPermission(manifest, "ui:settings");
                settingsPanels.push({
                    pluginId: manifest.id,
                    value: { ...panel, id: pluginScopedId(manifest.id, panel.id) },
                });
                notifyRegistryChanged();
            },
            registerSidebarPanel(panel) {
                requirePluginPermission(manifest, "ui:sidebar");
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
            registerMessageRenderer(renderer) {
                requirePluginPermission(manifest, "ui:messages");
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
            registerMessageAction(action) {
                requirePluginPermission(manifest, "ui:message-actions");
                messageActions.push({
                    pluginId: manifest.id,
                    value: { ...action, id: pluginScopedId(manifest.id, action.id) },
                });
                notifyRegistryChanged();
            },
            registerComposerAction(action) {
                requirePluginPermission(manifest, "ui:composer");
                composerActions.push({
                    pluginId: manifest.id,
                    value: { ...action, id: pluginScopedId(manifest.id, action.id) },
                });
                notifyRegistryChanged();
            },
            registerHeaderAction(action) {
                requirePluginPermission(manifest, "ui:header");
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
                requirePluginPermission(manifest, "ui:modals");
                const modalId = pluginScopedId(
                    manifest.id,
                    `${modal.id}-${crypto.randomUUID()}`,
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
                requirePluginPermission(manifest, "ui:styles");
                const style = document.createElement("style");
                style.dataset.pluginId = manifest.id;
                style.textContent = cssText;
                document.head.append(style);
            },
        },
        chat: {
            registerInputMiddleware(middleware) {
                requirePluginPermission(manifest, "chat:input");
                inputMiddlewares.push({ pluginId: manifest.id, value: middleware });
            },
            registerPromptMiddleware(middleware) {
                requirePluginPermission(manifest, "chat:prompt");
                promptMiddlewares.push({ pluginId: manifest.id, value: middleware });
            },
            registerOutputMiddleware(middleware) {
                requirePluginPermission(manifest, "chat:output");
                outputMiddlewares.push({ pluginId: manifest.id, value: middleware });
            },
        },
        presets: {
            registerMacro(name, resolver) {
                requirePluginPermission(manifest, "presets:macros");
                macroResolvers.set(name.trim(), {
                    pluginId: manifest.id,
                    value: resolver,
                });
            },
        },
        connections: {
            registerProvider(provider) {
                requirePluginPermission(manifest, "connections:providers");
                connectionProviders.set(provider.id, {
                    pluginId: manifest.id,
                    value: provider,
                });
                notifyRegistryChanged();
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

function pluginActions(manifest: PluginManifest): PluginActionsApi {
    return {
        async sendMessage(content, options) {
            requirePluginPermission(manifest, "actions");
            const handler = appActionHandlers.sendMessage;

            if (!handler) {
                throw new Error("Plugin sendMessage action is not available.");
            }

            await handler(content, options);
        },
        async generateResponse() {
            requirePluginPermission(manifest, "actions");
            const handler = appActionHandlers.generateResponse;

            if (!handler) {
                throw new Error("Plugin generateResponse action is not available.");
            }

            await handler();
        },
        async switchCharacter(characterId) {
            requirePluginPermission(manifest, "actions");
            const handler = appActionHandlers.switchCharacter;

            if (!handler) {
                throw new Error("Plugin switchCharacter action is not available.");
            }

            await handler(characterId);
        },
        setDraft(text) {
            requirePluginPermission(manifest, "actions");
            const handler = draftActionHandlers.setDraft;

            if (!handler) {
                throw new Error("Plugin setDraft action is not available.");
            }

            handler(text);
        },
        insertDraft(text) {
            requirePluginPermission(manifest, "actions");
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
            requirePluginPermission(manifest, "events");
            const listenersForEvent = eventListeners.get(eventName) ?? new Set();
            const item = { pluginId: manifest.id, listener };
            listenersForEvent.add(item);
            eventListeners.set(eventName, listenersForEvent);

            return () => listenersForEvent.delete(item);
        },
        emit(eventName, payload) {
            requirePluginPermission(manifest, "events");
            for (const item of eventListeners.get(eventName) ?? []) {
                if (isPluginEnabled(item.pluginId)) {
                    item.listener(payload);
                }
            }
        },
    };
}

function pluginScopedId(pluginId: string, itemId: string) {
    return itemId.startsWith(`${pluginId}:`) ? itemId : `${pluginId}:${itemId}`;
}

function notifyRegistryChanged() {
    for (const listener of listeners) {
        listener();
    }
}

function enabledValues<T>(items: Array<Owned<T>>) {
    return items
        .filter((item) => isPluginEnabled(item.pluginId))
        .map((item) => item.value);
}

function requirePluginPermission(manifest: PluginManifest, permission: string) {
    if (manifest.permissions?.includes(permission)) {
        return;
    }

    throw new Error(`${manifest.name} needs "${permission}" permission.`);
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
