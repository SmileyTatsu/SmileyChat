import type { h } from "preact";

import type { ConnectionProfile } from "../connections/config";
import type { ConnectionAdapter } from "../connections/types";
import type {
    ChatInputMiddleware,
    ChatOutputMiddleware,
    LoadedPlugin,
    MessageRenderer,
    PluginAppSnapshot,
    PluginComposerAction,
    PluginConnectionProvider,
    PluginEventsApi,
    PluginMacroResolver,
    PluginManifest,
    PluginMessageAction,
    PluginSettingsPanel,
    PluginStorageApi,
    PromptMiddleware,
    ScyllaPluginApi,
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
const messageRenderers: Array<Owned<MessageRenderer>> = [];
const messageActions: Array<Owned<PluginMessageAction>> = [];
const composerActions: Array<Owned<PluginComposerAction>> = [];
const inputMiddlewares: Array<Owned<ChatInputMiddleware>> = [];
const promptMiddlewares: Array<Owned<PromptMiddleware>> = [];
const outputMiddlewares: Array<Owned<ChatOutputMiddleware>> = [];
const macroResolvers = new Map<string, Owned<PluginMacroResolver>>();
const connectionProviders = new Map<string, Owned<PluginConnectionProvider>>();
const enabledPlugins = new Map<string, boolean>();
const listeners = new Set<Listener>();
const snapshotListeners = new Set<OwnedSnapshotListener>();
const eventListeners = new Map<string, Set<OwnedEventListener>>();
const pluginDisposers = new Map<string, () => void>();

let latestSnapshot: PluginAppSnapshot | undefined;

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
    removeOwnedItems(messageRenderers, pluginId);
    removeOwnedItems(messageActions, pluginId);
    removeOwnedItems(composerActions, pluginId);
    removeOwnedItems(inputMiddlewares, pluginId);
    removeOwnedItems(promptMiddlewares, pluginId);
    removeOwnedItems(outputMiddlewares, pluginId);
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

export function createPluginApi(
    manifest: PluginManifest,
    storage: PluginStorageApi,
    preactH: typeof h,
): ScyllaPluginApi {
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
