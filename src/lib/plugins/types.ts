import type { ComponentChildren, VNode } from "preact";

import type {
    ChatMode,
    ChatSession,
    Message,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import type { ConnectionProfile, ConnectionSettings } from "../connections/config";
import type {
    ChatGenerationMessage,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../connections/types";
import type { MacroContext } from "../presets/macros";
import type { PresetCollection } from "../presets/types";

export type PluginManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    main: string;
    styles?: string[];
    permissions?: string[];
    enabled?: boolean;
    entryUrl?: string;
    styleUrls?: string[];
    source?: "core" | "user";
};

export type LoadedPlugin = {
    manifest: PluginManifest;
    status: "loaded" | "error";
    error?: string;
};

export type PluginAppSnapshot = {
    mode: ChatMode;
    activeChat?: ChatSession;
    messages: Message[];
    character: SmileyCharacter;
    persona: SmileyPersona;
    userStatus: UserStatus;
    connectionSettings: ConnectionSettings;
    presetCollection: PresetCollection;
};

export type PluginSettingsPanelProps = {
    pluginId: string;
    storage: PluginStorageApi;
    snapshot: PluginAppSnapshot;
};

export type PluginSettingsPanel = {
    id: string;
    label: string;
    render: (props: PluginSettingsPanelProps) => ComponentChildren;
};

export type PluginSidebarPanelProps = {
    pluginId: string;
    storage: PluginStorageApi;
    snapshot: PluginAppSnapshot;
};

export type PluginSidebarPanel = {
    id: string;
    label: string;
    side: "left" | "right";
    render: (props: PluginSidebarPanelProps) => ComponentChildren;
};

export type MessageRenderContext = {
    content: string;
    message: Message;
    mode: ChatMode;
    characterName: string;
    characterAvatarPath?: string;
};

export type MessageRenderer = {
    id: string;
    priority?: number;
    render: (context: MessageRenderContext) => ComponentChildren;
};

export type PluginMessageActionContext = {
    message: Message;
    content: string;
    snapshot: PluginAppSnapshot;
};

export type PluginMessageAction = {
    id: string;
    label: string;
    renderIcon?: () => VNode;
    run: (context: PluginMessageActionContext) => void | Promise<void>;
};

export type PluginComposerActionContext = {
    draft: string;
    setDraft: (draft: string) => void;
    insertText: (text: string) => void;
    submit: () => void | Promise<void>;
    snapshot: PluginAppSnapshot;
};

export type PluginComposerAction = {
    id: string;
    label: string;
    renderIcon?: () => VNode;
    run: (context: PluginComposerActionContext) => void | Promise<void>;
};

export type PluginHeaderActionContext = {
    snapshot: PluginAppSnapshot;
};

export type PluginHeaderAction = {
    id: string;
    label: string;
    renderIcon?: () => VNode;
    run: (context: PluginHeaderActionContext) => void | Promise<void>;
};

export type ChatPipelineContext = {
    character: SmileyCharacter;
    mode: ChatMode;
    persona: SmileyPersona;
    userStatus: UserStatus;
    messages: Message[];
};

export type ChatInputMiddleware = (
    content: string,
    context: ChatPipelineContext,
) => string | Promise<string>;

export type PromptMiddlewareContext = ChatPipelineContext & {
    promptMessages: ChatGenerationMessage[];
};

export type PromptMiddleware = (
    messages: ChatGenerationMessage[],
    context: PromptMiddlewareContext,
) => ChatGenerationMessage[] | Promise<ChatGenerationMessage[]>;

export type ChatOutputMiddleware = (
    content: string,
    context: ChatPipelineContext & {
        result: ChatGenerationResult;
    },
) => string | Promise<string>;

export type PluginMacroResolver = (
    context: MacroContext,
    key: string,
) => string | undefined;

export type PluginConnectionProvider = {
    id: string;
    label: string;
    defaultConfig?: Record<string, unknown>;
    createAdapter: (profile: ConnectionProfile) => ConnectionAdapter;
    renderSettings?: (props: {
        profile: ConnectionProfile;
        disabled?: boolean;
        onChange: (config: Record<string, unknown>) => void;
        onSave: () => void | Promise<void>;
        onTest: () => void | Promise<void>;
    }) => ComponentChildren;
    testConnection?: (profile: ConnectionProfile) => Promise<string>;
};

export type PluginStorageApi = {
    getJson<T>(key: string, fallback: T): Promise<T>;
    setJson<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
};

export type PluginEventsApi = {
    on(eventName: string, listener: (payload: unknown) => void): () => void;
    emit(eventName: string, payload?: unknown): void;
};

export type PluginActionsApi = {
    sendMessage(content: string, options?: { images?: File[] }): Promise<void>;
    generateResponse(): Promise<void>;
    switchCharacter(characterId: string): Promise<void>;
    setDraft(text: string): void;
    insertDraft(text: string): void;
};

export type PluginNetworkFetchInit = {
    method?: string;
    headers?: HeadersInit;
    body?: string;
    maxResponseBytes?: number;
};

export type PluginNetworkApi = {
    fetch(url: string, init?: PluginNetworkFetchInit): Promise<Response>;
};

export type PluginModalProps = {
    close: () => void;
    snapshot: PluginAppSnapshot | undefined;
};

export type PluginModal = {
    id: string;
    title?: string;
    render: (props: PluginModalProps) => ComponentChildren;
};

export type PluginModalInstance = PluginModal & {
    pluginId: string;
};

export type SmileyPluginApi = {
    plugin: PluginManifest;
    state: {
        getSnapshot(): PluginAppSnapshot | undefined;
        subscribe(listener: (snapshot: PluginAppSnapshot) => void): () => void;
    };
    actions: PluginActionsApi;
    network: PluginNetworkApi;
    ui: {
        h: typeof import("preact").h;
        registerSettingsPanel(panel: PluginSettingsPanel): void;
        registerSidebarPanel(panel: PluginSidebarPanel): void;
        registerMessageRenderer(renderer: MessageRenderer): void;
        registerMessageAction(action: PluginMessageAction): void;
        registerComposerAction(action: PluginComposerAction): void;
        registerHeaderAction(action: PluginHeaderAction): void;
        openModal(modal: PluginModal): () => void;
        addStyles(cssText: string): void;
    };
    chat: {
        registerInputMiddleware(middleware: ChatInputMiddleware): void;
        registerPromptMiddleware(middleware: PromptMiddleware): void;
        registerOutputMiddleware(middleware: ChatOutputMiddleware): void;
    };
    presets: {
        registerMacro(name: string, resolver: PluginMacroResolver): void;
    };
    connections: {
        registerProvider(provider: PluginConnectionProvider): void;
    };
    storage: PluginStorageApi;
    events: PluginEventsApi;
};

export type SmileyPluginModule = {
    activate: (
        api: SmileyPluginApi,
    ) => void | (() => void) | Promise<void | (() => void)>;
};
